import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { ProjectRecord } from '../canonical/entities';
import { ClaudeService } from '../claude/claude.service';
import { StorageService } from '../ingestion/storage/storage.service';
import { ClassificationService } from './classification.service';

/**
 * The L1 Data Collection record types. Beyond the original eight Mr. Ayham
 * named, Wave 9 adds two expanded families the Repository now collects:
 *  - `email-correspondence` — emails/letters captured as records (details
 *    carry from/to/subject/sentAt/body).
 *  - `ocr-document` — a scanned image/PDF whose text was extracted (AI Vision
 *    OCR when ClaudeService is enabled, else manual-pending).
 *  - `bim-model` — IFC model summaries written by the clash module's BIM
 *    intake (listed here for completeness; created elsewhere).
 */
const RECORD_TYPES: string[] = [
  'rfi', 'submittal', 'ncr', 'change-request',
  'procurement-log', 'resource-log', 'cost-report', 'site-photo',
  'email-correspondence', 'ocr-document', 'bim-model', 'other',
];

export interface IngestRecordInput {
  projectBusinessKey: string;
  recordType: string;
  refNumber: string;
  title: string;
  status?: string | null;
  party?: string | null;
  raisedDate?: string | null;
  dueDate?: string | null;
  amount?: number | string | null;
  details?: Record<string, unknown>;
}

export interface OcrIngestInput {
  projectBusinessKey: string;
  filename: string;
  mimeType: string;
  contentBase64: string;
  refNumber?: string | null;
  title?: string | null;
}

/**
 * ProjectRecordService — the L1 Data Collection write/read path for the
 * polymorphic record families. Append-only versioned by (projectBusinessKey +
 * refNumber): re-ingesting the same ref bumps the version and flips isCurrent,
 * exactly like the rest of the canonical model.
 *
 * Repository intelligence (Agent-D mission §4): every write runs the
 * deterministic {@link ClassificationService} to MERGE suggested tags onto
 * `details.tags` (never overwriting user tags), and `/records/search` LIKE-
 * scans refNumber/title/details JSON so a reviewer can find any record fast.
 */
@Injectable()
export class ProjectRecordService {
  constructor(
    @InjectRepository(ProjectRecord) private readonly records: Repository<ProjectRecord>,
    private readonly classifier: ClassificationService,
    private readonly storage: StorageService,
    private readonly claude: ClaudeService,
  ) {}

  async ingest(input: IngestRecordInput): Promise<ProjectRecord> {
    if (!input.projectBusinessKey?.trim()) throw new BadRequestException('projectBusinessKey is required');
    if (!RECORD_TYPES.includes(input.recordType)) {
      throw new BadRequestException(`recordType must be one of: ${RECORD_TYPES.join(', ')}`);
    }
    if (!input.refNumber?.trim()) throw new BadRequestException('refNumber is required');
    if (!input.title?.trim()) throw new BadRequestException('title is required');

    // Auto-classify: derive tags from title + any free-form body in details.
    const details = { ...(input.details ?? {}) };
    const body = this.bodyFromDetails(details);
    const suggestion = this.classifier.suggestType(input.title, body);
    details.tags = this.classifier.mergeTags(details.tags, suggestion.tags);

    return this.persist({ ...input, details });
  }

  /**
   * OCR intake (mission §2): archive the image/PDF immutably, then — when
   * ClaudeService is enabled — run a Vision OCR pass and store the verbatim
   * text. When Claude is OFF we degrade gracefully: the record still lands with
   * `ocrSource:'manual-pending'` and `extractedText:null` so a human can fill it
   * in later. The archive (SHA-256) happens regardless — evidence first.
   */
  async ingestOcr(input: OcrIngestInput): Promise<ProjectRecord> {
    if (!input.projectBusinessKey?.trim()) throw new BadRequestException('projectBusinessKey is required');
    if (!input.filename?.trim()) throw new BadRequestException('filename is required');
    if (!input.contentBase64?.trim()) throw new BadRequestException('contentBase64 is required');
    const mime = (input.mimeType ?? '').toLowerCase();
    if (!mime.startsWith('image/') && mime !== 'application/pdf') {
      throw new BadRequestException('OCR accepts image/* or application/pdf only.');
    }

    const buffer = Buffer.from(input.contentBase64, 'base64');
    const sha256 = this.storage.sha256(buffer);
    const storedPath = await this.storage.archive(input.filename, buffer, sha256);

    let extractedText: string | null = null;
    let ocrSource: 'ai-vision' | 'manual-pending' = 'manual-pending';
    if (this.claude.isEnabled()) {
      try {
        const res = await this.claude.callVision({
          system:
            'You are an OCR transcription engine. Transcribe all text in the attachment verbatim. ' +
            'Do not summarise, translate, or add commentary. Return plain text only.',
          prompt: 'Transcribe all text verbatim; return plain text.',
          attachments: [{ mediaType: mime, dataBase64: input.contentBase64 }],
          temperature: 0,
        });
        extractedText = (res.content ?? '').slice(0, 20_000);
        ocrSource = 'ai-vision';
      } catch {
        // Vision call failed (rate limit / transient) — fall back to pending,
        // never block the archive. A re-run can fill the text in.
        extractedText = null;
        ocrSource = 'manual-pending';
      }
    }

    const refNumber = (input.refNumber?.trim() || input.filename).slice(0, 64);
    const title = (input.title?.trim() || `OCR — ${input.filename}`).slice(0, 512);
    const details: Record<string, unknown> = {
      filename: input.filename,
      mimeType: mime,
      storedPath,
      sha256,
      byteSize: buffer.length,
      extractedText,
      ocrSource,
    };
    // Tags derived from whatever text we managed to extract.
    const suggestion = this.classifier.suggestType(title, extractedText);
    details.tags = this.classifier.mergeTags(details.tags, suggestion.tags);

    return this.persist({
      projectBusinessKey: input.projectBusinessKey,
      recordType: 'ocr-document',
      refNumber,
      title,
      status: ocrSource === 'ai-vision' ? 'extracted' : 'manual-pending',
      details,
    });
  }

  /**
   * Re-run the deterministic classifier over a current record and persist the
   * merged tags (+ a `suggestedType`/confidence note in details). Returns the
   * updated current row.
   */
  async classify(id: string): Promise<ProjectRecord> {
    const row = await this.records.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`No record with id ${id}`);
    const body = this.bodyFromDetails(row.details ?? {});
    const suggestion = this.classifier.suggestType(row.title, body);
    const details = { ...(row.details ?? {}) };
    details.tags = this.classifier.mergeTags(details.tags, suggestion.tags);
    details.suggestedType = suggestion.recordType;
    details.classificationConfidence = suggestion.confidence;
    row.details = details;
    return this.records.save(row);
  }

  list(projectBusinessKey: string, recordType?: string): Promise<ProjectRecord[]> {
    const where: Record<string, unknown> = { projectBusinessKey, isCurrent: true };
    if (recordType) where.recordType = recordType;
    return this.records.find({ where, order: { createdAt: 'DESC' } });
  }

  async inventory(projectBusinessKey: string): Promise<Record<string, number>> {
    const rows = await this.records.find({ where: { projectBusinessKey, isCurrent: true } });
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.recordType] = (counts[r.recordType] ?? 0) + 1;
    return counts;
  }

  /**
   * Repository-intelligence full-text-ish search (mission §4): case-insensitive
   * LIKE across refNumber / title / the details JSON (CAST to char so JSON
   * values are searchable). Scoped to the current versions of one project.
   */
  search(projectBusinessKey: string, q: string): Promise<ProjectRecord[]> {
    if (!projectBusinessKey?.trim()) throw new BadRequestException('projectKey is required');
    const term = (q ?? '').trim();
    if (!term) return this.list(projectBusinessKey);
    const like = `%${term}%`;
    return this.records
      .createQueryBuilder('r')
      .where('r.projectBusinessKey = :pk', { pk: projectBusinessKey })
      .andWhere('r.isCurrent = :cur', { cur: true })
      .andWhere(
        new Brackets((qb) => {
          qb.where('r.refNumber LIKE :like', { like })
            .orWhere('r.title LIKE :like', { like })
            .orWhere('CAST(r.details AS CHAR) LIKE :like', { like });
        }),
      )
      .orderBy('r.createdAt', 'DESC')
      .take(100)
      .getMany();
  }

  static readonly TYPES = RECORD_TYPES;

  // ───────────────────────── internals ─────────────────────────

  /** Append-only versioned write keyed on (projectBusinessKey + refNumber). */
  private async persist(input: IngestRecordInput): Promise<ProjectRecord> {
    const businessKey = `${input.projectBusinessKey}:${input.refNumber.trim()}`;
    const prior = await this.records.findOne({ where: { businessKey, isCurrent: true } });
    if (prior) {
      prior.isCurrent = false;
      await this.records.save(prior);
    }
    const version = prior ? prior.version + 1 : 1;

    return this.records.save(
      this.records.create({
        businessKey,
        version,
        isCurrent: true,
        rawSource: { source: 'l1-data-collection', input: input as unknown as Record<string, unknown> },
        ingestionRunId: `l1-record-${businessKey}-v${version}`,
        sourceFileId: 'l1-record',
        projectBusinessKey: input.projectBusinessKey,
        recordType: input.recordType,
        refNumber: input.refNumber.trim(),
        title: input.title.trim(),
        status: input.status ?? null,
        party: input.party ?? null,
        raisedDate: input.raisedDate ?? null,
        dueDate: input.dueDate ?? null,
        amount: input.amount === null || input.amount === undefined ? null : String(input.amount),
        details: input.details ?? {},
      }),
    );
  }

  /** Best-effort free-form body the classifier can read (email body / OCR text). */
  private bodyFromDetails(details: Record<string, unknown>): string | null {
    const candidates = [details.body, details.extractedText, details.description, details.notes];
    const parts = candidates.filter((c): c is string => typeof c === 'string' && c.length > 0);
    return parts.length > 0 ? parts.join('\n') : null;
  }
}
