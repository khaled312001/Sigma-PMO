import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { SourceType, IngestionStatus } from '../../common/enums';
import { currentCompanyId } from '../../common/tenant/tenant-context';
import { AuditLog } from '../audit/audit-log.entity';
import { IngestionRun, ProjectRecord, SourceFile, User } from '../canonical/entities';
import { StorageService } from '../ingestion/storage/storage.service';
import { EvidenceProcessorService } from './evidence-processor.service';
import { EvidenceChunk } from './evidence-chunk.entity';
import { EvidenceFile } from './evidence-file.entity';
import { EvidenceItem } from './evidence-item.entity';
import { EvidenceRoom } from './evidence-room.entity';
import {
  categoryFromName, DEFAULT_MODE_FOR_KIND, EvidenceKind, EvidenceLimits, EvidenceMode, MODE_LIMITS,
} from './evidence.config';

export interface CreateRoomDto {
  title: string;
  kind?: EvidenceKind;
  mode?: EvidenceMode;
  projectKey?: string | null;
  description?: string;
}
export interface RawFile { filename: string; contentBase64: string }
export interface AddFilesResult {
  added: number;
  duplicates: number;
  rejected: Array<{ filename: string; reason: string }>;
  room: EvidenceRoom;
}

@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);

  constructor(
    @InjectRepository(EvidenceRoom) private readonly rooms: Repository<EvidenceRoom>,
    @InjectRepository(EvidenceFile) private readonly files: Repository<EvidenceFile>,
    @InjectRepository(EvidenceChunk) private readonly chunks: Repository<EvidenceChunk>,
    @InjectRepository(EvidenceItem) private readonly items: Repository<EvidenceItem>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
    @InjectRepository(ProjectRecord) private readonly records: Repository<ProjectRecord>,
    @InjectRepository(SourceFile) private readonly sourceFiles: Repository<SourceFile>,
    @InjectRepository(IngestionRun) private readonly runs: Repository<IngestionRun>,
    private readonly storage: StorageService,
    private readonly processor: EvidenceProcessorService,
  ) {}

  // ── rooms ────────────────────────────────────────────────────────────────
  async createRoom(dto: CreateRoomDto, caller: User): Promise<EvidenceRoom> {
    if (!dto.title?.trim()) throw new BadRequestException('title is required');
    const kind = (dto.kind ?? 'standard') as EvidenceKind;
    const mode = (dto.mode ?? DEFAULT_MODE_FOR_KIND[kind] ?? 'standard') as EvidenceMode;
    const room = await this.rooms.save(this.rooms.create({
      companyId: caller.companyId ?? currentCompanyId(),
      projectBusinessKey: dto.projectKey?.trim() || null,
      kind, mode,
      title: dto.title.trim().slice(0, 512),
      description: dto.description?.trim() || null,
      status: 'open',
      limits: { ...MODE_LIMITS[mode] },
      limitOverride: false,
      counts: { files: 0, indexed: 0, extracted: 0, chunks: 0, items: 0, conflicts: 0, gaps: 0 },
    }));
    await this.writeAudit(caller, room, 'evidence.room.created', { kind, mode });
    return room;
  }

  async listRooms(caller: User, projectKey?: string): Promise<EvidenceRoom[]> {
    const cid = caller.companyId ?? currentCompanyId();
    const where: Record<string, unknown> = {};
    if (cid) where.companyId = cid;
    if (projectKey) where.projectBusinessKey = projectKey;
    return this.rooms.find({ where, order: { createdAt: 'DESC' }, take: 200 });
  }

  async getRoom(id: string, caller: User): Promise<EvidenceRoom> {
    const room = await this.rooms.findOne({ where: { id } });
    if (!room) throw new NotFoundException('Evidence room not found');
    const cid = caller.companyId ?? currentCompanyId();
    if (cid && room.companyId && room.companyId !== cid) throw new ForbiddenException('Not your room');
    return room;
  }

  /**
   * Raise (or change) a room's capacity beyond the mode default — the on-demand
   * expansion Ayham asked for. Admin-tier; recorded in the audit log. Some rooms
   * or disputes simply need more analysis capacity than ordinary use.
   */
  async raiseLimit(id: string, patch: Partial<EvidenceLimits>, caller: User): Promise<EvidenceRoom> {
    const room = await this.getRoom(id, caller);
    const merged: EvidenceLimits = { ...room.limits };
    for (const k of ['maxFiles', 'maxBytes', 'maxBytesPerFile', 'chunkChars', 'filesPerTick'] as const) {
      const v = (patch as unknown as Record<string, unknown>)[k];
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) (merged as unknown as Record<string, unknown>)[k] = Math.round(v);
    }
    if (patch.depth && ['shallow', 'standard', 'deep'].includes(patch.depth)) merged.depth = patch.depth;
    room.limits = merged;
    room.limitOverride = true;
    await this.rooms.save(room);
    await this.writeAudit(caller, room, 'evidence.limit.raised', { limits: merged });
    return room;
  }

  // ── batch upload ───────────────────────────────────────────────────────────
  async addFiles(roomId: string, incoming: RawFile[], caller: User): Promise<AddFilesResult> {
    const room = await this.getRoom(roomId, caller);
    if (!Array.isArray(incoming) || incoming.length === 0) throw new BadRequestException('No files provided');

    const existing = await this.files.find({ where: { roomId: room.id }, select: { id: true, sha256: true, bytes: true } });
    const existingShas = new Set(existing.map((f) => f.sha256).filter(Boolean) as string[]);
    let totalBytes = existing.reduce((a, f) => a + Number(f.bytes || 0), 0);

    if (existing.length + incoming.length > room.limits.maxFiles) {
      throw new BadRequestException(
        `File count would exceed this room's limit of ${room.limits.maxFiles}. An admin can raise the limit (POST /evidence/rooms/${room.id}/limits).`,
      );
    }

    const rejected: AddFilesResult['rejected'] = [];
    let added = 0, duplicates = 0;
    const batchShas = new Set<string>();

    for (const f of incoming) {
      const buf = Buffer.from(f.contentBase64 || '', 'base64');
      const bytes = buf.length;
      if (bytes === 0) { rejected.push({ filename: f.filename, reason: 'empty' }); continue; }
      const sha = this.storage.sha256(buf);
      if (existingShas.has(sha) || batchShas.has(sha)) { duplicates++; continue; }
      if (bytes > room.limits.maxBytesPerFile) {
        rejected.push({ filename: f.filename, reason: `exceeds per-file limit (${Math.round(room.limits.maxBytesPerFile / 1048576)}MB) — raise the room limit to ingest it` });
        continue;
      }
      if (totalBytes + bytes > room.limits.maxBytes) {
        throw new BadRequestException(
          `Total size would exceed this room's limit of ${Math.round(room.limits.maxBytes / 1048576)}MB. An admin can raise the limit (POST /evidence/rooms/${room.id}/limits).`,
        );
      }
      const ext = (f.filename.split('.').pop() || '').toLowerCase().slice(0, 16);
      const storedPath = await this.storage.archive(`evidence/${room.id}/${sha}-${f.filename}`.slice(0, 200), buf, sha);
      await this.files.save(this.files.create({
        roomId: room.id, companyId: room.companyId, fileName: f.filename.slice(0, 512), ext,
        bytes, sha256: sha, storedPath, category: categoryFromName(f.filename), status: 'received',
        createdByEmail: caller.email,
      }));
      batchShas.add(sha); existingShas.add(sha); totalBytes += bytes; added++;
    }

    room.status = room.status === 'open' || room.status === 'ready' || room.status === 'committed' ? 'indexing' : room.status;
    room.counts = { ...(room.counts ?? {}), files: existing.length + added };
    await this.rooms.save(room);
    await this.writeAudit(caller, room, 'evidence.files.added', { added, duplicates, rejected: rejected.length });

    // Kick the background pipeline (fire-and-forget; the cron also drives it).
    void this.processor.advance(room.id).catch((e) => this.logger.warn(`advance failed: ${(e as Error).message}`));
    return { added, duplicates, rejected, room: await this.getRoom(room.id, caller) };
  }

  // ── retrieval ────────────────────────────────────────────────────────────
  listFiles(roomId: string, caller: User) {
    return this.getRoom(roomId, caller).then(() => this.files.find({ where: { roomId }, order: { docDate: 'ASC', createdAt: 'ASC' }, take: 2000 }));
  }
  async listItems(roomId: string, caller: User, type?: string): Promise<EvidenceItem[]> {
    await this.getRoom(roomId, caller);
    const where: Record<string, unknown> = { roomId };
    if (type) where.type = type;
    return this.items.find({ where, order: { chronologyOrder: 'ASC', createdAt: 'ASC' }, take: 5000 });
  }
  async timeline(roomId: string, caller: User): Promise<EvidenceItem[]> {
    await this.getRoom(roomId, caller);
    return this.items.find({ where: { roomId, type: In(['fact', 'event']) }, order: { chronologyOrder: 'ASC' }, take: 5000 });
  }
  async fileChunks(roomId: string, fileId: string, caller: User): Promise<EvidenceChunk[]> {
    await this.getRoom(roomId, caller);
    return this.chunks.find({ where: { roomId, fileId }, order: { chunkIndex: 'ASC' }, take: 1000 });
  }

  /** Manual re-drive of the pipeline for a room (e.g. after raising a limit). */
  async process(roomId: string, caller: User): Promise<EvidenceRoom> {
    const room = await this.getRoom(roomId, caller);
    await this.processor.advance(room.id);
    return this.getRoom(room.id, caller);
  }

  // ── human review + commit ──────────────────────────────────────────────────
  async decide(roomId: string, decisions: Array<{ id: string; decision: 'confirm' | 'correct' | 'exclude'; correctedValue?: string }>, caller: User): Promise<{ updated: number }> {
    const room = await this.getRoom(roomId, caller);
    let updated = 0;
    for (const d of decisions ?? []) {
      const item = await this.items.findOne({ where: { id: d.id, roomId: room.id } });
      if (!item) continue;
      item.status = d.decision === 'confirm' ? 'confirmed' : d.decision === 'correct' ? 'corrected' : 'excluded';
      if (d.decision === 'correct') item.correctedValue = d.correctedValue?.slice(0, 4000) ?? null;
      item.decidedByEmail = caller.email;
      await this.items.save(item);
      updated++;
    }
    await this.writeAudit(caller, room, 'evidence.items.decided', { updated });
    return { updated };
  }

  /**
   * Commit the confirmed/corrected findings into canonical ProjectRecords with
   * full provenance (a SourceFile + IngestionRun), after human review. Every
   * committed item keeps its source links. Audited.
   */
  async commit(roomId: string, caller: User): Promise<{ committed: number }> {
    const room = await this.getRoom(roomId, caller);
    const confirmed = await this.items.find({ where: { roomId: room.id, status: In(['confirmed', 'corrected']) }, take: 5000 });
    if (!confirmed.length) throw new BadRequestException('No confirmed items to commit. Review and confirm findings first.');

    const projectKey = room.projectBusinessKey || `evidence:${room.id}`;
    const payload = Buffer.from(JSON.stringify({ room: room.id, title: room.title, items: confirmed.map((i) => i.id) }, null, 2), 'utf8');
    const sha = this.storage.sha256(payload);
    const storedPath = await this.storage.archive(`evidence-commit-${room.id}.json`, payload, sha);
    const source = await this.sourceFiles.save(this.sourceFiles.create({
      companyId: room.companyId, filename: `evidence-room-${room.id}.json`,
      sourceType: 'evidence_room' as unknown as SourceType, contentSha256: sha, byteSize: payload.byteLength, storedPath,
    }));
    const run = await this.runs.save(this.runs.create({
      companyId: room.companyId, sourceFileId: source.id, parser: 'evidence-room',
      status: IngestionStatus.NORMALIZED, startedAt: new Date(), finishedAt: new Date(),
      validationPassed: true, rowCounts: { records: confirmed.length },
      summary: { roomId: room.id, committedBy: caller.email },
    }));

    let committed = 0, i = 0;
    for (const item of confirmed) {
      const ref = `EV-${room.id.slice(0, 8)}-${++i}`;
      await this.records.save(this.records.create({
        companyId: room.companyId, ingestionRunId: run.id, sourceFileId: source.id,
        businessKey: ref, version: 1, isCurrent: true,
        rawSource: item as unknown as Record<string, unknown>,
        projectBusinessKey: projectKey, recordType: 'other', refNumber: ref,
        title: item.label || item.type, status: item.status, party: null,
        raisedDate: item.effectiveDate ?? null, dueDate: null, amount: null,
        details: { value: item.correctedValue ?? item.value, type: item.type, layer: item.layer, confidence: item.confidence, sourceRefs: item.sourceRefs ?? [] },
      }));
      committed++;
    }
    room.status = 'committed';
    await this.rooms.save(room);
    await this.writeAudit(caller, room, 'evidence.committed', { committed, projectKey });
    return { committed };
  }

  // ── audit helper ───────────────────────────────────────────────────────────
  private async writeAudit(caller: User, room: EvidenceRoom, action: string, meta: Record<string, unknown>): Promise<void> {
    try {
      await this.audit.save(this.audit.create({
        companyId: room.companyId, actorUserId: caller.id, actorEmail: caller.email, actorRole: caller.role,
        action, method: 'POST', path: `/evidence/rooms/${room.id}`, statusCode: 200, ip: null,
        meta: { roomId: room.id, title: room.title, kind: room.kind, mode: room.mode, ...meta },
      }));
    } catch (err) { this.logger.warn(`Evidence audit skipped: ${(err as Error).message}`); }
  }
}
