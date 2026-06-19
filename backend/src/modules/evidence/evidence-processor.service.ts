import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import JSZip from 'jszip';
import { Workbook } from 'exceljs';

import { AuditLog } from '../audit/audit-log.entity';
import { ClaudeService } from '../claude/claude.service';
import { StorageService } from '../ingestion/storage/storage.service';
import { EvidenceChunk } from './evidence-chunk.entity';
import { EvidenceFile } from './evidence-file.entity';
import { EvidenceItem, EvidenceSourceRef } from './evidence-item.entity';
import { EvidenceRoom } from './evidence-room.entity';
import {
  ANALYZE_ROOM_SYSTEM, chunkText, EXPECTED_FOR_KIND, EXTRACT_ITEMS_SYSTEM, EvidenceCategory,
} from './evidence.config';

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff']);
const TEXT_EXT = new Set(['csv', 'txt', 'json', 'xml', 'md', 'log', 'tsv', 'html', 'htm']);
const CAD_EXT = new Set(['dwg', 'dxf', 'rvt', 'ifc', 'nwd', 'nwc', 'skp', 'step', 'stp', 'iges']);
const VIDEO_EXT = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v']);

function looksBinary(s: string): boolean {
  for (let i = 0; i < Math.min(s.length, 200); i++) {
    const c = s.charCodeAt(i);
    if ((c >= 0 && c <= 8) || c === 11 || c === 12 || (c >= 14 && c <= 31)) return true;
  }
  return false;
}

interface ExtractResult { text: string; pageCount: number | null; note?: string }

/**
 * The staged, resumable background pipeline for a Dispute Data Room:
 *   index → extract (ALL file types) → chunk → analyse (map, per-file) →
 *   timeline → conflicts/gaps (reduce) → assemble.
 * Each `advance()` processes ONE bounded batch then returns, so large rooms make
 * incremental progress across cron ticks without blocking. Every finding keeps a
 * source link back to file/page/paragraph.
 */
@Injectable()
export class EvidenceProcessorService {
  private readonly logger = new Logger(EvidenceProcessorService.name);

  constructor(
    @InjectRepository(EvidenceRoom) private readonly rooms: Repository<EvidenceRoom>,
    @InjectRepository(EvidenceFile) private readonly files: Repository<EvidenceFile>,
    @InjectRepository(EvidenceChunk) private readonly chunks: Repository<EvidenceChunk>,
    @InjectRepository(EvidenceItem) private readonly items: Repository<EvidenceItem>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
    private readonly storage: StorageService,
    private readonly claude: ClaudeService,
  ) {}

  /** Advance a room by ONE bounded stage-batch. Safe to call repeatedly. */
  async advance(roomId: string): Promise<EvidenceRoom | null> {
    const room = await this.rooms.findOne({ where: { id: roomId } });
    if (!room) return null;
    if (['ready', 'committed', 'closed', 'failed'].includes(room.status)) return room;
    try {
      if (await this.files.count({ where: { roomId, status: 'received' } })) return await this.indexBatch(room);
      if (await this.files.count({ where: { roomId, status: 'indexed' } })) return await this.extractBatch(room);
      if (await this.files.count({ where: { roomId, status: 'chunked' } })) return await this.analyzeBatch(room);
      return await this.reduce(room);
    } catch (err) {
      this.logger.error(`advance(${roomId}) failed: ${(err as Error).message}`);
      room.stage = `error: ${(err as Error).message}`.slice(0, 120);
      room.lastProcessedAt = new Date();
      return this.rooms.save(room);
    }
  }

  /** Run a room to completion (bounded) — used after upload + by tests. */
  async runToCompletion(roomId: string, maxTicks = 200): Promise<EvidenceRoom | null> {
    let room: EvidenceRoom | null = null;
    for (let i = 0; i < maxTicks; i++) {
      room = await this.advance(roomId);
      if (!room || ['ready', 'committed', 'closed', 'failed'].includes(room.status)) break;
    }
    return room;
  }

  // ── stage 1: index ──────────────────────────────────────────────────────────
  private async indexBatch(room: EvidenceRoom): Promise<EvidenceRoom> {
    const batch = await this.files.find({ where: { roomId: room.id, status: 'received' }, take: room.limits.filesPerTick });
    for (const f of batch) { f.status = 'indexed'; await this.files.save(f); }
    return this.stamp(room, 'indexing', 'extracting', { indexed: await this.files.count({ where: { roomId: room.id, status: Not(In(['received'])) } }) });
  }

  // ── stage 2: extract (ALL file types) + chunk ────────────────────────────────
  private async extractBatch(room: EvidenceRoom): Promise<EvidenceRoom> {
    const batch = await this.files.find({ where: { roomId: room.id, status: 'indexed' }, take: room.limits.filesPerTick });
    for (const f of batch) {
      try {
        const buf = f.storedPath ? await this.storage.read(f.storedPath) : Buffer.alloc(0);
        const ex = await this.extractContent(f, buf);
        f.pageCount = ex.pageCount;
        if (ex.text.trim()) {
          const cs = chunkText(ex.text, room.limits.chunkChars);
          let n = 0;
          for (const c of cs) {
            await this.chunks.save(this.chunks.create({
              roomId: room.id, fileId: f.id, companyId: room.companyId,
              chunkIndex: c.index, page: c.page, paragraph: c.paragraph, text: c.text, charCount: c.text.length,
            }));
            n++;
          }
          f.chunkCount = n;
          f.status = 'chunked';
        } else {
          // Binary with no extractable text (CAD/video/other): keep as referenced
          // evidence and record a finding so it appears in the index + review.
          f.chunkCount = 0;
          f.status = 'chunked';
          await this.items.save(this.items.create({
            roomId: room.id, companyId: room.companyId, type: 'fact', layer: 'supporting-evidence',
            label: `${f.fileName} (referenced evidence)`, value: ex.note ?? 'Binary file referenced as evidence.',
            confidence: 0.5, status: 'proposed',
            sourceRefs: [{ fileId: f.id, fileName: f.fileName, page: null, paragraph: null }],
          }));
        }
      } catch (err) {
        f.status = 'failed'; f.error = (err as Error).message.slice(0, 1000);
      }
      await this.files.save(f);
    }
    const chunks = await this.chunks.count({ where: { roomId: room.id } });
    return this.stamp(room, 'extracting', 'analyzing', { chunks, extracted: await this.files.count({ where: { roomId: room.id, status: In(['chunked', 'analyzed']) } }) });
  }

  /** Multi-format content extraction. Text → parse; PDF → parse, vision fallback;
   * image → vision (OCR/description); CAD/video/binary → referenced (note). */
  private async extractContent(f: EvidenceFile, buf: Buffer): Promise<ExtractResult> {
    const ext = (f.ext ?? '').toLowerCase();
    if (buf.length === 0) return { text: '', pageCount: null, note: 'Empty file.' };

    if (ext === 'docx') return { text: await this.extractDocx(buf), pageCount: null };
    if (ext === 'xlsx' || ext === 'xls') return { text: await this.extractXlsx(buf), pageCount: null };
    if (TEXT_EXT.has(ext)) {
      const s = buf.toString('utf8');
      return { text: looksBinary(s) ? '' : s, pageCount: null };
    }
    if (ext === 'pdf') {
      const parsed = await this.extractPdf(buf);
      if (parsed.text.trim().length > 80) return parsed;
      // Scanned/image PDF — let the AI read it natively.
      const vision = await this.visionExtract(buf, 'application/pdf');
      return { text: vision || parsed.text, pageCount: parsed.pageCount, note: vision ? undefined : 'PDF had no extractable text.' };
    }
    if (IMAGE_EXT.has(ext)) {
      const mt = `image/${ext === 'jpg' ? 'jpeg' : ext === 'tif' ? 'tiff' : ext}`;
      const vision = await this.visionExtract(buf, mt);
      return { text: vision, pageCount: null, note: vision ? undefined : 'Image referenced (AI vision unavailable).' };
    }
    if (CAD_EXT.has(ext)) return { text: '', pageCount: null, note: `CAD/BIM file (${ext}) referenced as evidence — export a PDF/image for AI content analysis (or use the Autodesk APS connector).` };
    if (VIDEO_EXT.has(ext)) return { text: '', pageCount: null, note: `Video file (${ext}) referenced as evidence — provide a transcript/key frames for AI content analysis.` };
    // Unknown: best-effort UTF-8, else reference.
    const s = buf.toString('utf8');
    if (s && !looksBinary(s)) return { text: s, pageCount: null };
    return { text: '', pageCount: null, note: `Binary file (${ext || 'unknown'}) referenced as evidence.` };
  }

  private async extractDocx(buf: Buffer): Promise<string> {
    try {
      const zip = await JSZip.loadAsync(buf);
      const xml = await zip.file('word/document.xml')?.async('string');
      if (!xml) return '';
      return xml.replace(/<w:p[ >]/g, '\n<w:p ').replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim();
    } catch { return ''; }
  }
  private async extractXlsx(buf: Buffer): Promise<string> {
    try {
      const wb = new Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      const lines: string[] = [];
      wb.eachSheet((sheet) => {
        lines.push(`# Sheet: ${sheet.name}`);
        sheet.eachRow((row) => {
          const vals = (row.values as unknown[]).slice(1).map((v) => (v == null ? '' : String(typeof v === 'object' && v && 'text' in (v as object) ? (v as { text: unknown }).text : v)));
          if (vals.some((v) => v !== '')) lines.push(vals.join(' | '));
        });
      });
      return lines.join('\n');
    } catch { return ''; }
  }
  private async extractPdf(buf: Buffer): Promise<ExtractResult> {
    try {
      const mod = await import('pdf-parse');
      const PDFParse = (mod as { PDFParse?: new (o: { data: Buffer }) => { getText: () => Promise<unknown> } }).PDFParse;
      if (!PDFParse) {
        const fn = (mod as unknown as { default?: (b: Buffer) => Promise<{ text: string; numpages?: number }> }).default;
        if (fn) { const r = await fn(buf); return { text: r.text ?? '', pageCount: r.numpages ?? null }; }
        return { text: '', pageCount: null };
      }
      const r = (await new PDFParse({ data: buf }).getText()) as { text?: string; total?: number; pages?: unknown[] };
      return { text: r?.text ?? '', pageCount: r?.total ?? (Array.isArray(r?.pages) ? r.pages.length : null) };
    } catch (err) {
      this.logger.warn(`PDF parse failed: ${(err as Error).message}`);
      return { text: '', pageCount: null };
    }
  }
  private async visionExtract(buf: Buffer, mediaType: string): Promise<string> {
    if (!this.claude.isEnabled()) return '';
    try {
      const r = await this.claude.callVision({
        system: 'You are an OCR + document-reading engine. Transcribe ALL text and describe key tables/figures from the attached document/image as faithful plain text. Output only the extracted text.',
        prompt: 'Extract all text and key information from the attached file.',
        attachments: [{ mediaType, dataBase64: buf.toString('base64') }],
        maxTokens: 6000, temperature: 0,
      });
      return (r?.content ?? '').trim();
    } catch (err) { this.logger.warn(`vision extract failed: ${(err as Error).message}`); return ''; }
  }

  // ── stage 3: analyse (map, per-file, source-linked) ──────────────────────────
  private async analyzeBatch(room: EvidenceRoom): Promise<EvidenceRoom> {
    const batch = await this.files.find({ where: { roomId: room.id, status: 'chunked' }, take: room.limits.filesPerTick });
    for (const f of batch) {
      const chunks = await this.chunks.find({ where: { roomId: room.id, fileId: f.id }, order: { chunkIndex: 'ASC' }, take: 400 });
      if (!chunks.length) { f.status = 'analyzed'; await this.files.save(f); continue; }
      try {
        if (this.claude.isEnabled()) await this.analyzeFileWithAi(room, f, chunks);
        else await this.analyzeFileDeterministic(room, f, chunks);
        f.status = 'analyzed';
      } catch (err) {
        await this.analyzeFileDeterministic(room, f, chunks);
        f.status = 'analyzed'; f.error = `ai: ${(err as Error).message}`.slice(0, 500);
      }
      await this.files.save(f);
    }
    const itemCount = await this.items.count({ where: { roomId: room.id } });
    return this.stamp(room, 'analyzing', undefined, { items: itemCount });
  }

  private async analyzeFileWithAi(room: EvidenceRoom, f: EvidenceFile, chunks: EvidenceChunk[]): Promise<void> {
    // Map step: send THIS file's chunks (tagged) — never the whole room at once.
    const maxChars = room.limits.depth === 'deep' ? 60000 : room.limits.depth === 'standard' ? 36000 : 18000;
    let corpus = ''; const used: EvidenceChunk[] = [];
    for (const c of chunks) {
      const tag = `\n\n[chunk ${c.chunkIndex} | page ${c.page ?? '-'} | para ${c.paragraph ?? '-'}]\n`;
      if (corpus.length + tag.length + c.text.length > maxChars) break;
      corpus += tag + c.text; used.push(c);
    }
    const r = await this.claude.callText({
      system: EXTRACT_ITEMS_SYSTEM,
      prompt: `Source document: "${f.fileName}" (category hint: ${f.category}).\n${corpus}`,
      maxTokens: 6000, temperature: 0,
    });
    const parsed = this.parseJson(r?.content ?? '');
    if (parsed.category && typeof parsed.category === 'string') f.category = parsed.category as EvidenceCategory;
    if (parsed.docNumber) f.docNumber = String(parsed.docNumber).slice(0, 128);
    if (parsed.party) f.party = String(parsed.party).slice(0, 255);
    if (parsed.docDate && /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.docDate))) f.docDate = String(parsed.docDate);
    const byIndex = new Map(used.map((c) => [c.chunkIndex, c]));
    for (const it of (Array.isArray(parsed.items) ? parsed.items : [])) {
      const src = byIndex.get(Number((it as Record<string, unknown>).sourceChunk)) ?? used[0];
      const ref: EvidenceSourceRef = { fileId: f.id, fileName: f.fileName, page: src?.page ?? null, paragraph: src?.paragraph ?? null, docNumber: f.docNumber, party: f.party, date: f.docDate };
      await this.items.save(this.items.create({
        roomId: room.id, companyId: room.companyId,
        type: this.itemType((it as Record<string, unknown>).type),
        layer: String((it as Record<string, unknown>).layer ?? 'claims').slice(0, 32),
        label: String((it as Record<string, unknown>).label ?? 'finding').slice(0, 512),
        value: (it as Record<string, unknown>).value != null ? String((it as Record<string, unknown>).value).slice(0, 4000) : null,
        effectiveDate: /^\d{4}-\d{2}-\d{2}$/.test(String((it as Record<string, unknown>).effectiveDate)) ? String((it as Record<string, unknown>).effectiveDate) : null,
        confidence: this.clamp01((it as Record<string, unknown>).confidence), sourceRefs: [ref], status: 'proposed',
      }));
    }
  }

  private async analyzeFileDeterministic(room: EvidenceRoom, f: EvidenceFile, chunks: EvidenceChunk[]): Promise<void> {
    // Deterministic fallback (AI disabled): one source-linked digest per file so
    // the repository is still populated and reviewable.
    const c0 = chunks[0];
    await this.items.save(this.items.create({
      roomId: room.id, companyId: room.companyId, type: 'fact', layer: 'supporting-evidence',
      label: `${f.fileName} — extracted content`, value: (c0?.text ?? '').slice(0, 1200), confidence: 0.3, status: 'proposed',
      sourceRefs: [{ fileId: f.id, fileName: f.fileName, page: c0?.page ?? null, paragraph: c0?.paragraph ?? null }],
    }));
  }

  // ── stage 4: timeline + conflicts/gaps (reduce) + assemble ───────────────────
  private async reduce(room: EvidenceRoom): Promise<EvidenceRoom> {
    // timeline: order dated facts/events.
    const dated = await this.items.find({ where: { roomId: room.id, type: In(['fact', 'event']), effectiveDate: Not(IsNull()) }, order: { effectiveDate: 'ASC' } });
    let order = 1;
    for (const it of dated) { it.chronologyOrder = order++; await this.items.save(it); }

    // gaps (deterministic): expected categories for this kind that are absent.
    const filesByCat = await this.files.find({ where: { roomId: room.id }, select: { category: true } });
    const present = new Set(filesByCat.map((f) => f.category));
    let gaps = 0;
    for (const cat of EXPECTED_FOR_KIND[room.kind] ?? []) {
      if (!present.has(cat)) {
        await this.items.save(this.items.create({
          roomId: room.id, companyId: room.companyId, type: 'gap', layer: 'missing-information',
          label: `Missing expected evidence: ${cat}`, value: `No ${cat} document was provided for this ${room.kind}.`,
          confidence: 0.6, status: 'proposed', sourceRefs: [],
        }));
        gaps++;
      }
    }

    // conflicts + assessment (reduce via AI over COMPACT item summaries — scalable).
    let conflicts = 0, summary: string | null = null;
    const strengths: string[] = [], weaknesses: string[] = [];
    if (this.claude.isEnabled()) {
      const facts = await this.items.find({ where: { roomId: room.id, type: In(['fact', 'event', 'claim_point']) }, order: { effectiveDate: 'ASC' }, take: 400 });
      if (facts.length) {
        const compact = facts.map((i) => `- id=${i.id} [${i.type}] ${i.effectiveDate ?? '----'} | ${i.label}: ${(i.value ?? '').slice(0, 160)}`).join('\n');
        try {
          const r = await this.claude.callText({ system: ANALYZE_ROOM_SYSTEM, prompt: `Evidence items (${room.kind} / ${room.title}):\n${compact}`, maxTokens: 4000, temperature: 0 });
          const a = this.parseJson(r?.content ?? '');
          for (const cf of (Array.isArray(a.conflicts) ? a.conflicts : [])) {
            await this.items.save(this.items.create({
              roomId: room.id, companyId: room.companyId, type: 'conflict', layer: 'claims',
              label: String((cf as Record<string, unknown>).label ?? 'conflict').slice(0, 512),
              explanation: (cf as Record<string, unknown>).explanation != null ? String((cf as Record<string, unknown>).explanation).slice(0, 2000) : null,
              relatedItemIds: Array.isArray((cf as Record<string, unknown>).itemIds) ? ((cf as Record<string, unknown>).itemIds as string[]).slice(0, 20) : null,
              confidence: 0.6, status: 'proposed', sourceRefs: [],
            }));
            conflicts++;
          }
          for (const gp of (Array.isArray(a.gaps) ? a.gaps : [])) {
            await this.items.save(this.items.create({
              roomId: room.id, companyId: room.companyId, type: 'gap', layer: 'missing-information',
              label: String((gp as Record<string, unknown>).label ?? 'gap').slice(0, 512),
              explanation: (gp as Record<string, unknown>).explanation != null ? String((gp as Record<string, unknown>).explanation).slice(0, 2000) : null,
              confidence: 0.5, status: 'proposed', sourceRefs: [],
            }));
            gaps++;
          }
          if (Array.isArray(a.strengths)) strengths.push(...a.strengths.map((s) => String(s).slice(0, 300)));
          if (Array.isArray(a.weaknesses)) weaknesses.push(...a.weaknesses.map((s) => String(s).slice(0, 300)));
          if (typeof a.summary === 'string') summary = a.summary.slice(0, 2000);
        } catch (err) { this.logger.warn(`reduce AI failed: ${(err as Error).message}`); }
      }
    }

    const totalItems = await this.items.count({ where: { roomId: room.id } });
    const totalFiles = await this.files.count({ where: { roomId: room.id } });
    room.report = {
      summary, strengths, weaknesses,
      counts: { files: totalFiles, items: totalItems, timeline: dated.length, conflicts, gaps },
      generatedAt: room.lastProcessedAt?.toISOString() ?? null,
      note: 'Deterministic-first; AI findings require human review before commit. Source links preserved on every item.',
    };
    return this.stamp(room, 'analyzing', 'ready', { items: totalItems, conflicts, gaps, timeline: dated.length });
  }

  // ── helpers ──────────────────────────────────────────────────────────────────
  private async stamp(room: EvidenceRoom, fromStage: string, toStatus: EvidenceRoom['status'] | undefined, countPatch: Record<string, number>): Promise<EvidenceRoom> {
    room.counts = { ...(room.counts ?? {}), ...countPatch };
    room.stage = toStatus ?? fromStage;
    if (toStatus) room.status = toStatus;
    room.lastProcessedAt = new Date();
    return this.rooms.save(room);
  }
  private itemType(v: unknown): EvidenceItem['type'] {
    const t = String(v ?? 'fact');
    return (['fact', 'event', 'conflict', 'gap', 'strength', 'weakness', 'claim_point'].includes(t) ? t : 'fact') as EvidenceItem['type'];
  }
  private clamp01(v: unknown): number {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
  }
  private parseJson(content: string): { category?: unknown; docNumber?: unknown; party?: unknown; docDate?: unknown; items?: unknown[]; conflicts?: unknown[]; gaps?: unknown[]; strengths?: unknown[]; weaknesses?: unknown[]; summary?: unknown } {
    let s = (content ?? '').trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) s = fence[1].trim();
    const a = s.indexOf('{'); const b = s.lastIndexOf('}');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    try { return JSON.parse(s); } catch { return { items: [] }; }
  }
}
