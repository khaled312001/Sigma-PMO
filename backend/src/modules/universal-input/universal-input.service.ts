import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import JSZip from 'jszip';
import { Workbook } from 'exceljs';

import { SourceType, IngestionStatus } from '../../common/enums';
import { currentCompanyId } from '../../common/tenant/tenant-context';
import { AuditLog } from '../audit/audit-log.entity';
import { IngestionRun, ProjectRecord, SourceFile, User } from '../canonical/entities';
import { ClaudeService } from '../claude/claude.service';
import { StorageService } from '../ingestion/storage/storage.service';
import { InputItem, InputItemDecision, InputProposal } from './input-proposal.entity';

export interface RawFile {
  filename: string;
  contentBase64: string;
}
export interface AnalyzeDto {
  files?: RawFile[];
  text?: string;
  projectKey?: string | null;
}
export interface CommitDecision {
  id: string;
  decision: InputItemDecision;
  correctedValue?: string | null;
}

/** The Sigma layer taxonomy the AI maps to (slugs). */
const SIGMA_LAYERS = [
  'project-data', 'planning', 'commercial', 'risk', 'claims', 'governance',
  'procurement', 'qs', 'daily-reporting', 'compliance', 'approvals',
  'stakeholders', 'assumptions', 'missing-information', 'supporting-evidence',
];

const EXTRACT_SYSTEM = `You are Sigma PMO's intake analyst. You receive raw, unstructured project information (files and/or pasted text). Extract every distinct, useful piece of project information and MAP each to the correct Sigma layer, for a HUMAN to review before anything is committed.

Sigma layers (use the exact slug):
- project-data: project identity, client/employer, location, contract value, key dates, currency
- planning: schedule/baseline, activities, milestones, durations, % complete
- commercial: budget, costs, cash flow, payments, variations
- risk: risks, threats, mitigations, risk-register entries
- claims: claims, disputes, EOT, contractual notices
- governance: decisions, policies, compliance gates, escalations
- procurement: vendors, packages, RFQs, long-lead items, awards
- qs: quantities, BOQ items, rates, measurement, valuations
- daily-reporting: daily/weekly site reports, progress, manpower, weather
- compliance: permits, authority/regulatory approvals, HSE/fire/safety
- approvals: submittals, RFIs awaiting approval, sign-offs
- stakeholders: people, roles, contacts, responsibilities
- assumptions: assumptions stated or implied in the input
- missing-information: REQUIRED information that is absent (raise a question)
- supporting-evidence: documents/photos/references that back other items

Rules:
- NEVER invent data. If a value is uncertain, set completeness="uncertain" and lower the confidence.
- For REQUIRED information that is absent, add an item with layer="missing-information", completeness="missing", value="", and a clear "question".
- List any assumptions you made to produce a value.
- Be specific: ONE fact per item; prefer many precise items over few vague ones.
- Output STRICT JSON ONLY — no prose, no markdown, no code fences — exactly:
{"summary": string, "items": [{"layer": string, "label": string, "value": string, "confidence": number, "completeness": "complete"|"uncertain"|"missing", "assumptions": string[], "question": string|null, "evidence": string|null}], "questions": string[]}`;

@Injectable()
export class UniversalInputService {
  private readonly logger = new Logger(UniversalInputService.name);

  constructor(
    @InjectRepository(InputProposal) private readonly proposals: Repository<InputProposal>,
    @InjectRepository(ProjectRecord) private readonly records: Repository<ProjectRecord>,
    @InjectRepository(SourceFile) private readonly sources: Repository<SourceFile>,
    @InjectRepository(IngestionRun) private readonly runs: Repository<IngestionRun>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
    private readonly claude: ClaudeService,
    private readonly storage: StorageService,
  ) {}

  /** Catalogue of layers for the UI. */
  layers(): string[] {
    return [...SIGMA_LAYERS];
  }

  // ─────────────────────────── analyze ───────────────────────────

  async analyze(dto: AnalyzeDto, caller: User): Promise<InputProposal> {
    if (!this.claude.isEnabled()) {
      throw new ServiceUnavailableException(
        'AI input is not available — configure the Claude API key in /admin/settings.',
      );
    }
    const files = dto.files ?? [];
    const pasted = (dto.text ?? '').trim();
    if (files.length === 0 && !pasted) {
      throw new BadRequestException('Provide at least one file or some pasted text.');
    }

    // Build a text corpus from text-extractable files + pasted text, and collect
    // PDFs/images as native vision attachments for Claude.
    const corpusParts: string[] = [];
    const attachments: Array<{ mediaType: string; dataBase64: string }> = [];
    const sourceMeta: Array<{ name: string; type: string; bytes: number }> = [];
    if (pasted) corpusParts.push(`[PASTED TEXT]\n${pasted}`);

    for (const f of files.slice(0, 12)) {
      const buf = this.decode(f.contentBase64);
      sourceMeta.push({ name: f.filename, type: this.extOf(f.filename), bytes: buf.byteLength });
      const ext = this.extOf(f.filename);
      if (ext === 'pdf') {
        attachments.push({ mediaType: 'application/pdf', dataBase64: f.contentBase64 });
      } else if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
        attachments.push({ mediaType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, dataBase64: f.contentBase64 });
      } else {
        const text = await this.extractText(f.filename, buf, ext);
        if (text) corpusParts.push(`[FILE: ${f.filename}]\n${text}`);
      }
    }

    let corpus = corpusParts.join('\n\n----------------\n\n');
    if (corpus.length > 120_000) corpus = corpus.slice(0, 120_000) + '\n…[truncated]';

    const prompt =
      `Analyze the following project input${attachments.length ? ' and the attached document(s)/image(s)' : ''} ` +
      `and return the strict JSON described in the system prompt.\n\n${corpus || '(see attachments)'}`;

    let content: string;
    let model: string;
    try {
      if (attachments.length > 0) {
        const r = await this.claude.callVision({ system: EXTRACT_SYSTEM, prompt, attachments: attachments.slice(0, 6), maxTokens: 8000, temperature: 0 });
        content = r.content; model = r.model;
      } else {
        const r = await this.claude.callText({ system: EXTRACT_SYSTEM, prompt, maxTokens: 8000, temperature: 0 });
        content = r.content; model = r.model;
      }
    } catch (err) {
      this.logger.error(`Claude extraction failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('The AI could not analyse the input. Please try again.');
    }

    const parsed = this.parseJson(content);
    const items: InputItem[] = (parsed.items ?? []).map((it) => ({
      id: randomUUID(),
      layer: SIGMA_LAYERS.includes(String(it.layer)) ? String(it.layer) : 'project-data',
      label: String(it.label ?? '').slice(0, 500),
      value: String(it.value ?? ''),
      confidence: this.clamp01(it.confidence),
      completeness: ['complete', 'uncertain', 'missing'].includes(String(it.completeness)) ? (it.completeness as InputItem['completeness']) : 'uncertain',
      assumptions: Array.isArray(it.assumptions) ? it.assumptions.map(String).slice(0, 10) : [],
      question: it.question ? String(it.question).slice(0, 500) : null,
      evidence: it.evidence ? String(it.evidence).slice(0, 300) : null,
      decision: 'pending',
      correctedValue: null,
    }));

    const proposal = await this.proposals.save(
      this.proposals.create({
        companyId: caller.companyId ?? currentCompanyId(),
        projectBusinessKey: dto.projectKey?.trim() || null,
        status: 'pending_review',
        source: { files: sourceMeta, pastedChars: pasted.length },
        summary: parsed.summary ? String(parsed.summary).slice(0, 4000) : null,
        model,
        items,
        questions: Array.isArray(parsed.questions) ? parsed.questions.map(String).slice(0, 30) : [],
        createdByEmail: caller.email,
      }),
    );
    this.logger.log(`Universal input analysed: ${items.length} item(s) across ${new Set(items.map((i) => i.layer)).size} layer(s) (proposal ${proposal.id}).`);
    return proposal;
  }

  // ─────────────────────────── read ───────────────────────────

  async list(caller: User): Promise<InputProposal[]> {
    const cid = caller.companyId ?? currentCompanyId();
    return this.proposals.find({ where: cid ? { companyId: cid } : {}, order: { createdAt: 'DESC' }, take: 30 });
  }

  async get(id: string, caller: User): Promise<InputProposal> {
    const p = await this.proposals.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Proposal not found');
    const cid = caller.companyId ?? currentCompanyId();
    if (cid && p.companyId && p.companyId !== cid) throw new ForbiddenException('Not your proposal');
    return p;
  }

  // ─────────────────────────── commit ───────────────────────────

  /**
   * Commit the user-reviewed items. Only confirmed/corrected/assumption/limited-
   * confidence items become official records; excluded + missing are recorded as
   * decisions. Every decision is written to the audit log. Returns the outcome.
   */
  async commit(id: string, decisions: CommitDecision[], caller: User): Promise<InputProposal> {
    const proposal = await this.get(id, caller);
    if (proposal.status === 'committed') throw new BadRequestException('Proposal already committed');

    const byId = new Map(decisions.map((d) => [d.id, d]));
    const items = proposal.items.map((it) => {
      const d = byId.get(it.id);
      if (!d) return { ...it, decision: it.decision ?? 'pending' };
      return { ...it, decision: d.decision, correctedValue: d.correctedValue ?? it.correctedValue ?? null };
    });

    const COMMIT_DECISIONS: InputItemDecision[] = ['confirm', 'correct', 'assumption', 'limited_confidence'];
    const toCommit = items.filter((it) => COMMIT_DECISIONS.includes(it.decision as InputItemDecision));
    const tally: Record<string, number> = {};
    for (const it of items) tally[it.decision ?? 'pending'] = (tally[it.decision ?? 'pending'] ?? 0) + 1;

    const projectKey = proposal.projectBusinessKey || 'UNASSIGNED';
    const createdRecordIds: string[] = [];

    if (toCommit.length > 0) {
      // One SourceFile + IngestionRun give the committed records their provenance.
      const payload = Buffer.from(JSON.stringify({ proposalId: proposal.id, items: toCommit }), 'utf8');
      const sha = this.storage.sha256(payload);
      const storedPath = await this.storage.archive(`universal-input-${proposal.id}.json`, payload, sha);
      const source = await this.sources.save(this.sources.create({
        companyId: proposal.companyId, filename: `universal-input-${proposal.id}.json`,
        sourceType: 'universal_input' as unknown as SourceType, contentSha256: sha, byteSize: payload.byteLength, storedPath,
      }));
      const run = await this.runs.save(this.runs.create({
        companyId: proposal.companyId, sourceFileId: source.id, parser: 'universal-input',
        status: IngestionStatus.NORMALIZED, startedAt: new Date(), finishedAt: new Date(),
        validationPassed: true, rowCounts: { records: toCommit.length },
        summary: { proposalId: proposal.id, committedBy: caller.email, decisions: tally },
      }));

      let i = 0;
      for (const it of toCommit) {
        const ref = `UI-${proposal.id.slice(0, 8)}-${++i}`;
        const flags = {
          layer: it.layer,
          aiConfidence: it.confidence,
          completeness: it.completeness,
          assumptions: it.assumptions,
          userDecision: it.decision,
          isAssumption: it.decision === 'assumption',
          limitedConfidence: it.decision === 'limited_confidence',
          evidence: it.evidence,
        };
        const saved = await this.records.save(this.records.create({
          companyId: proposal.companyId,
          ingestionRunId: run.id,
          sourceFileId: source.id,
          businessKey: ref,
          version: 1,
          isCurrent: true,
          rawSource: it as unknown as Record<string, unknown>,
          projectBusinessKey: projectKey,
          recordType: 'other',
          refNumber: ref,
          title: it.label || it.layer,
          status: it.completeness,
          party: null,
          raisedDate: null,
          dueDate: null,
          amount: null,
          details: { value: it.correctedValue ?? it.value, ...flags },
        }));
        createdRecordIds.push(saved.id);
      }
    }

    // Record EVERY decision in the audit log (assumptions, overrides, exclusions,
    // missing-data) so governance + reports can reflect them.
    try {
      await this.audit.insert(items.filter((it) => (it.decision ?? 'pending') !== 'pending').map((it) => ({
        companyId: proposal.companyId,
        actorUserId: caller.id,
        actorEmail: caller.email,
        actorRole: caller.role,
        action: 'input.decision',
        method: 'POST',
        path: `/input/proposals/${proposal.id}/commit`,
        statusCode: 200,
        ip: null,
        meta: { layer: it.layer, label: it.label, decision: it.decision, confidence: it.confidence, completeness: it.completeness, projectKey },
      })));
    } catch (err) {
      this.logger.warn(`Audit of input decisions skipped: ${(err as Error).message}`);
    }

    proposal.items = items;
    proposal.status = 'committed';
    proposal.committedAt = new Date();
    proposal.committedByEmail = caller.email;
    proposal.commitResult = {
      committed: toCommit.length,
      excluded: tally['exclude'] ?? 0,
      missing: tally['missing'] ?? 0,
      assumptions: tally['assumption'] ?? 0,
      limitedConfidence: tally['limited_confidence'] ?? 0,
      decisions: tally,
      recordIds: createdRecordIds,
      projectKey,
    };
    await this.proposals.save(proposal);
    this.logger.log(`Universal input committed: ${toCommit.length} record(s) to project ${projectKey} (proposal ${proposal.id}).`);
    return proposal;
  }

  // ─────────────────────────── helpers ───────────────────────────

  private decode(b64: string): Buffer {
    return Buffer.from(b64, 'base64');
  }
  private extOf(name: string): string {
    return (name.split('.').pop() ?? '').toLowerCase();
  }
  private clamp01(n: unknown): number {
    const v = Number(n);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5;
  }

  /** Extract plain text from supported document types (best-effort). */
  private async extractText(filename: string, buf: Buffer, ext: string): Promise<string> {
    try {
      if (ext === 'docx') {
        const zip = await JSZip.loadAsync(buf);
        const xml = await zip.file('word/document.xml')?.async('string');
        if (!xml) return '';
        return xml
          .replace(/<w:p[ >]/g, '\n<w:p ')
          .replace(/<w:tab\/>/g, '\t')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }
      if (ext === 'xlsx' || ext === 'xls') {
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
      }
      if (['csv', 'txt', 'json', 'xml', 'md'].includes(ext)) {
        return buf.toString('utf8');
      }
      // Unknown text-ish file: best-effort UTF-8.
      const s = buf.toString('utf8');
      return /[\x00-\x08\x0e-\x1f]/.test(s.slice(0, 200)) ? '' : s;
    } catch (err) {
      this.logger.warn(`Text extraction failed for ${filename}: ${(err as Error).message}`);
      return '';
    }
  }

  private parseJson(content: string): { summary?: unknown; items?: Array<Record<string, unknown>>; questions?: unknown[] } {
    let s = content.trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) s = fence[1].trim();
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    try {
      return JSON.parse(s);
    } catch {
      this.logger.warn('Failed to parse AI JSON; returning empty extraction.');
      return { summary: 'The AI response could not be parsed.', items: [], questions: [] };
    }
  }
}
