import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ConceptDocument, InvestmentOpportunity } from '../canonical/entities';
import { ClaudeService } from '../claude/claude.service';
import { StorageService } from '../ingestion/storage/storage.service';

/**
 * ConceptIntakeService — the sketch path Mr. Ayham described: "many investors
 * start with a simple sketch, handwritten notes or an early concept layout."
 *
 * Flow (human-gated end-to-end):
 *  1. upload  — archive the sketch/image/PDF content-addressed (same immutable
 *               store as every ingested file).
 *  2. extract — AI vision/OCR interpretation proposes structured fields (plot
 *               area, BUA, floors, zones, dimensions, unit mix, capacity,
 *               notes, assumptions). Proposal only — touches nothing.
 *               Degrades to `manual` when no Anthropic key is configured.
 *  3. confirm — a human reviews/edits the proposal; ONLY the confirmed fields
 *               merge into the opportunity's feasibility inputs. This is the
 *               platform's human-approval gate applied to vision output.
 */

const ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf',
]);
const MAX_BYTES = 15 * 1024 * 1024;

/** The structured fields the extractor proposes / a human confirms. */
export interface ConceptFields {
  plotAreaSqm?: number | null;
  builtUpAreaSqm?: number | null;
  floors?: number | null;
  functionalZones?: string[];
  approxDimensions?: string | null;
  unitMix?: Array<{ type: string; count: number }>;
  capacity?: string | null;
  writtenNotes?: string[];
  keyAssumptions?: string[];
}

const EXTRACTION_SYSTEM =
  'You are a construction-investment intake analyst. You read early concept ' +
  'sketches, hand drawings, handwritten notes and preliminary layout PDFs and ' +
  'extract ONLY what is actually visible or written. Never invent values. ' +
  'If a field is not present, return null for it. Respond with a single JSON ' +
  'object and nothing else.';

const EXTRACTION_PROMPT =
  'Extract the available project information from this concept document into ' +
  'exactly this JSON shape (numbers in square metres where applicable):\n' +
  '{\n' +
  '  "plotAreaSqm": number|null,\n' +
  '  "builtUpAreaSqm": number|null,\n' +
  '  "floors": number|null,\n' +
  '  "functionalZones": string[],\n' +
  '  "approxDimensions": string|null,\n' +
  '  "unitMix": [{"type": string, "count": number}],\n' +
  '  "capacity": string|null,\n' +
  '  "writtenNotes": string[],\n' +
  '  "keyAssumptions": string[],\n' +
  '  "confidence": number\n' +
  '}\n' +
  'confidence is your 0-1 overall confidence in the extraction. ' +
  'Include any handwritten text you can read in writtenNotes verbatim.';

@Injectable()
export class ConceptIntakeService {
  private readonly logger = new Logger(ConceptIntakeService.name);

  constructor(
    @InjectRepository(ConceptDocument)
    private readonly docs: Repository<ConceptDocument>,
    @InjectRepository(InvestmentOpportunity)
    private readonly opportunities: Repository<InvestmentOpportunity>,
    private readonly storage: StorageService,
    private readonly claude: ClaudeService,
  ) {}

  async upload(input: {
    opportunityId: string;
    filename: string;
    mimeType: string;
    contentBase64: string;
    uploadedBy?: string | null;
  }): Promise<ConceptDocument> {
    const opp = await this.opportunities.findOne({ where: { id: input.opportunityId } });
    if (!opp) throw new NotFoundException(`Opportunity ${input.opportunityId} not found`);
    if (!ALLOWED_MIME.has(input.mimeType)) {
      throw new BadRequestException(
        `Unsupported type "${input.mimeType}". Allowed: ${[...ALLOWED_MIME].join(', ')}`,
      );
    }
    const buffer = Buffer.from(input.contentBase64, 'base64');
    if (!buffer.length) throw new BadRequestException('Empty file');
    if (buffer.length > MAX_BYTES) {
      throw new BadRequestException(`File too large (${buffer.length} bytes; max ${MAX_BYTES})`);
    }
    const sha256 = this.storage.sha256(buffer);
    const storedPath = await this.storage.archive(input.filename, buffer, sha256);
    return this.docs.save(
      this.docs.create({
        opportunityId: input.opportunityId,
        filename: input.filename,
        mimeType: input.mimeType,
        storedPath,
        sha256,
        sizeBytes: buffer.length,
        extractionStatus: 'pending',
        extraction: null,
        confirmedFields: null,
        extractionError: null,
        uploadedBy: input.uploadedBy ?? null,
        confirmedBy: null,
      }),
    );
  }

  async list(opportunityId: string): Promise<ConceptDocument[]> {
    return this.docs.find({ where: { opportunityId }, order: { createdAt: 'DESC' } });
  }

  /**
   * Run AI vision extraction over the archived file. Proposal only — the
   * result lands in `extraction`, never in the opportunity inputs. When the
   * Claude key is not configured the document flips to `manual` so the human
   * can type the fields in the same confirm form (graceful degradation).
   */
  async extract(docId: string): Promise<ConceptDocument> {
    const doc = await this.docs.findOne({ where: { id: docId } });
    if (!doc) throw new NotFoundException(`Concept document ${docId} not found`);

    if (!this.claude.isEnabled()) {
      doc.extractionStatus = 'manual';
      doc.extractionError =
        'AI extraction unavailable: no Anthropic API key configured (set one in /admin/settings). Enter the fields manually and confirm.';
      return this.docs.save(doc);
    }

    try {
      const buffer = await this.storage.read(doc.storedPath);
      const result = await this.claude.callVision({
        system: EXTRACTION_SYSTEM,
        prompt: EXTRACTION_PROMPT,
        attachments: [{ mediaType: doc.mimeType, dataBase64: buffer.toString('base64') }],
        maxTokens: 2000,
        temperature: 0,
      });
      const parsed = parseJsonObject(result.content);
      if (!parsed) throw new Error('Model response contained no parseable JSON object');
      doc.extraction = {
        fields: normalizeFields(parsed),
        confidence: clamp01(Number(parsed.confidence ?? 0.5)),
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        rawText: result.content.slice(0, 8000),
      };
      doc.extractionStatus = 'extracted';
      doc.extractionError = null;
    } catch (err) {
      doc.extractionStatus = 'failed';
      doc.extractionError = (err as Error).message?.slice(0, 500) ?? 'unknown error';
      this.logger.warn(`Concept extraction failed for ${docId}: ${doc.extractionError}`);
    }
    return this.docs.save(doc);
  }

  /**
   * Human approval gate: persist the reviewed fields and merge them into the
   * opportunity's structured feasibility inputs (only non-empty values win;
   * existing manual entries are never silently erased by nulls).
   */
  async confirm(docId: string, fields: ConceptFields, confirmedBy?: string | null): Promise<ConceptDocument> {
    const doc = await this.docs.findOne({ where: { id: docId } });
    if (!doc) throw new NotFoundException(`Concept document ${docId} not found`);
    const opp = await this.opportunities.findOne({ where: { id: doc.opportunityId } });
    if (!opp) throw new NotFoundException(`Opportunity ${doc.opportunityId} not found`);

    const clean = normalizeFields(fields as Record<string, unknown>);
    doc.confirmedFields = clean as Record<string, unknown>;
    doc.extractionStatus = 'confirmed';
    doc.confirmedBy = confirmedBy ?? null;
    await this.docs.save(doc);

    const inputs = { ...(opp.inputs ?? {}) };
    for (const [k, v] of Object.entries(clean)) {
      const empty = v === null || v === undefined || (Array.isArray(v) && v.length === 0);
      if (!empty) inputs[k] = v;
    }
    inputs.conceptDocumentId = doc.id;
    opp.inputs = inputs;
    await this.opportunities.save(opp);
    return doc;
  }
}

/** Pull the first balanced top-level JSON object out of a model response. */
function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function normalizeFields(raw: Record<string, unknown>): ConceptFields {
  const num = (v: unknown): number | null => {
    const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : [];
  const mix = Array.isArray(raw.unitMix)
    ? (raw.unitMix as Array<Record<string, unknown>>)
        .filter((u) => u && typeof u.type === 'string')
        .map((u) => ({ type: String(u.type), count: num(u.count) ?? 0 }))
        .slice(0, 30)
    : [];
  return {
    plotAreaSqm: num(raw.plotAreaSqm),
    builtUpAreaSqm: num(raw.builtUpAreaSqm),
    floors: num(raw.floors),
    functionalZones: strArr(raw.functionalZones),
    approxDimensions: typeof raw.approxDimensions === 'string' ? raw.approxDimensions : null,
    unitMix: mix,
    capacity: typeof raw.capacity === 'string' ? raw.capacity : raw.capacity != null ? String(raw.capacity) : null,
    writtenNotes: strArr(raw.writtenNotes),
    keyAssumptions: strArr(raw.keyAssumptions),
  };
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5);
