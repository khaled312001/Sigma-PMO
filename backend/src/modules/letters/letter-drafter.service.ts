import { existsSync, promises as fs } from 'node:fs';

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SourceFile } from '../canonical/entities';
import { ClaudeService, PersonaCallResult } from '../claude/claude.service';
import { SourcesService } from '../sources/sources.service';
import { Letter, LetterTrigger } from './letter.entity';

/**
 * Persona slug the LetterDrafter calls for every FIDIC reply. Pulled out as a
 * constant so the tests assert on the wiring (not on a literal) and so the
 * Wave-3 swap to a refined persona slug (e.g. `fidic-redbook-expert-v2`)
 * touches one line.
 */
export const FIDIC_PERSONA_SLUG = 'fidic-redbook-expert';

/** Max bytes we will pass through to the persona as incoming-letter context. */
export const MAX_INCOMING_LETTER_BYTES = 256 * 1024;

/**
 * Reasons the drafter may refuse to persist a generated letter. Surfaced as
 * the `code` field on the thrown exception so the controller / front-end can
 * react without parsing English error strings.
 *
 *  - `missing-citations`: the persona response carried zero `[SOURCE: id]`
 *    markers. Wave 2 rule (post-meeting plan §3.3 rule 5): claims without
 *    sources are flagged as assumptions, never silently persisted as facts.
 *
 *  - `unknown-citation`: the persona cited a source id that is not in the
 *    curated `SourceRegistry`. Treated as a fabricated citation and the
 *    draft is rejected (same severity as `missing-citations`).
 *
 *  - `unparseable-response`: the persona response did not contain the
 *    minimal scaffolding (Arabic body marker + Sub-Clause line) the drafter
 *    needs to populate the `Letter` row. We surface this rather than
 *    silently persisting a malformed letter.
 */
export type LetterDrafterRejectionCode =
  | 'missing-citations'
  | 'unknown-citation'
  | 'unparseable-response';

export class LetterDrafterRejection extends BadRequestException {
  constructor(readonly code: LetterDrafterRejectionCode, message: string) {
    super({ statusCode: 400, code, message });
  }
}

/**
 * Context object the controller passes for a compliance-flag draft. Free-form
 * by design — the trigger is whatever the upstream rule wants to surface (e.g.
 * the PMI org-chart auditor finding "QA/QC Manager role unfilled for 14 days").
 *
 * The drafter weaves this into the user message it sends the persona; it does
 * NOT persist the context verbatim because the produced Letter is what the
 * human approves and sends, not the trigger payload.
 */
export interface ComplianceLetterContext {
  /** Short label, e.g. `pmi.org-chart-non-compliance`. Used in subject + logs. */
  triggerCode: string;
  /** Free-text narrative the persona should weave into the reply. */
  narrative: string;
  /** Optional facts (rule findings, dates, dependencies) the persona may cite. */
  facts?: Record<string, unknown>;
  /**
   * Optional FIDIC letter-template prefill. When present, its clause + body
   * scaffold prime the persona AND act as the deterministic fallback for the
   * letter's `fidicClauseRef` / `subject` when the persona omits them.
   */
  template?: {
    key: string;
    title: string;
    fidicClause: string;
    category: string;
    bodySkeleton: string;
  };
}

/**
 * `LetterDrafterService` — Layer 3 / Governance FIDIC letter drafter
 * (post-meeting plan §3.5, ADR-0010 §6, ADR-0011 §3).
 *
 * Two entry points, both produce a persisted `Letter` row in `status='draft'`:
 *
 *  - {@link draftFromIncoming}: reads the bytes of the incoming contractor
 *    letter (via the `SourceFile.storedPath` pointer), asks the
 *    `fidic-redbook-expert` persona via `ClaudeService` to identify the
 *    applicable Sub-Clause + deadline + reply body, then persists.
 *
 *  - {@link draftComplianceLetter}: takes a compliance trigger + free-form
 *    narrative (e.g. PMI org-chart non-compliance), asks the same persona
 *    to compose a formal letter, then persists.
 *
 * Both paths enforce the **mandatory citation footer**: the persona response
 * must contain at least one `[SOURCE: id]` marker whose id exists in the
 * curated `SourceRegistry`. A response with zero citations or with a
 * fabricated id is rejected with `LetterDrafterRejection` — the draft is
 * never silently persisted. This is the post-meeting plan §3.3 rule 5
 * applied at the entity boundary, not just at the prompt boundary.
 *
 * Both paths persist with `status='draft'` and refuse to ever auto-flip it
 * to `approved` / `sent` — that gate is in {@link approve} and requires an
 * explicit human action via the controller.
 *
 * The service does NOT render PDFs. PDF rendering of an approved letter is
 * `LetterPdfService` (separate concern: approval gate + audit log entry on
 * approval, then PDF on demand).
 */
@Injectable()
export class LetterDrafterService {
  private readonly logger = new Logger(LetterDrafterService.name);

  constructor(
    @InjectRepository(Letter) private readonly letters: Repository<Letter>,
    @InjectRepository(SourceFile) private readonly sourceFiles: Repository<SourceFile>,
    private readonly claude: ClaudeService,
    private readonly sources: SourcesService,
  ) {}

  // ───────────────────────── public surface ─────────────────────────

  /**
   * Draft a reply to an incoming contractor letter.
   *
   * @param letterSourceFileId  Id of the `SourceFile` row holding the bytes
   *                            of the contractor letter (PDF, text, scanned
   *                            image). The drafter reads the bytes from
   *                            `storedPath` and passes the decoded text to
   *                            the persona inside an
   *                            `<untrusted_contractor_letter>` wrapper.
   * @param projectKey          `Project.businessKey` the letter belongs to.
   *
   * Throws:
   *  - `NotFoundException`            if the source file id does not resolve.
   *  - `LetterDrafterRejection`       if the persona response carries zero
   *                                   valid citations from the SourceRegistry.
   */
  async draftFromIncoming(
    letterSourceFileId: string,
    projectKey: string,
  ): Promise<Letter> {
    if (!letterSourceFileId) {
      throw new BadRequestException('letterSourceFileId is required');
    }
    if (!projectKey) {
      throw new BadRequestException('projectKey is required');
    }

    const source = await this.sourceFiles.findOne({ where: { id: letterSourceFileId } });
    if (!source) {
      throw new NotFoundException(`No source file with id ${letterSourceFileId}`);
    }

    const incomingText = await this.readSourceFileText(source);
    const userMessage = this.buildIncomingDraftPrompt(projectKey, source.filename);
    const context =
      `<untrusted_contractor_letter project="${projectKey}" filename="${source.filename}">\n` +
      `${incomingText}\n` +
      `</untrusted_contractor_letter>`;

    const result = await this.claude.callPersona(FIDIC_PERSONA_SLUG, userMessage, {
      context,
    });

    const citations = await this.validateCitations(result);

    const draft = this.parsePersonaDraft(result.content);
    return this.persistDraft({
      projectKey,
      trigger: 'incoming-letter',
      incomingLetterSourceFileId: letterSourceFileId,
      subject: draft.subject,
      bodyAr: draft.bodyAr,
      bodyEn: draft.bodyEn,
      fidicClauseRef: draft.fidicClauseRef,
      deadlineDays: draft.deadlineDays,
      citations,
    });
  }

  /**
   * Draft a compliance letter from a non-letter trigger (PMI org-chart
   * non-compliance, deterministic rule finding, etc.).
   *
   * Unlike {@link draftFromIncoming} there is no `SourceFile` to read — the
   * caller hands us the trigger code + narrative + facts inline.
   */
  async draftComplianceLetter(
    projectKey: string,
    complianceTrigger: string,
    context: ComplianceLetterContext,
  ): Promise<Letter> {
    if (!projectKey) {
      throw new BadRequestException('projectKey is required');
    }
    if (!complianceTrigger) {
      throw new BadRequestException('complianceTrigger is required');
    }
    if (!context?.narrative) {
      throw new BadRequestException('context.narrative is required');
    }

    const userMessage = this.buildComplianceDraftPrompt(projectKey, complianceTrigger);
    const templateBlock = context.template
      ? `\n<fidic_template key="${context.template.key}" clause="${context.template.fidicClause}" category="${context.template.category}">\n` +
        `title: ${context.template.title}\n` +
        `skeleton: ${context.template.bodySkeleton}\n` +
        `</fidic_template>\n`
      : '';
    const personaContext =
      `<compliance_trigger code="${complianceTrigger}" project="${projectKey}">\n` +
      `${context.narrative}\n` +
      (context.facts ? `\nfacts:\n${JSON.stringify(context.facts, null, 2)}\n` : '') +
      templateBlock +
      `</compliance_trigger>`;

    const result = await this.claude.callPersona(FIDIC_PERSONA_SLUG, userMessage, {
      context: personaContext,
    });

    const citations = await this.validateCitations(result);
    const draft = this.parsePersonaDraft(result.content);
    return this.persistDraft({
      projectKey,
      trigger: 'compliance-flag',
      incomingLetterSourceFileId: null,
      // Template prefill is the deterministic fallback when the persona omits
      // the subject / clause (e.g. offline test mode with no live Claude).
      subject: draft.subject || context.template?.title || `Compliance — ${complianceTrigger}`,
      bodyAr: draft.bodyAr,
      bodyEn: draft.bodyEn,
      fidicClauseRef: draft.fidicClauseRef ?? context.template?.fidicClause ?? null,
      deadlineDays: draft.deadlineDays,
      citations,
    });
  }

  /** Read endpoint — every draft / approved / sent letter for one project. */
  listByProject(projectKey: string): Promise<Letter[]> {
    if (!projectKey) {
      throw new BadRequestException('projectKey is required');
    }
    return this.letters.find({
      where: { projectBusinessKey: projectKey },
      order: { createdAt: 'DESC' },
    });
  }

  async getById(id: string): Promise<Letter> {
    const row = await this.letters.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`No letter with id ${id}`);
    return row;
  }

  /**
   * Flip `status='draft'` → `status='approved'`. Idempotent if already
   * approved. Refuses to operate on a `sent` row (cannot un-send).
   *
   * Wave 2 does NOT expose a `send` operation — actual transmission needs
   * Computer Use safety (ADR-0011) which is still gated. Approval is the
   * highest state this module reaches.
   */
  async approve(letterId: string): Promise<Letter> {
    const row = await this.getById(letterId);
    if (row.status === 'sent') {
      throw new BadRequestException(`Letter ${letterId} is already sent; cannot re-approve`);
    }
    if (row.status === 'approved') return row;
    row.status = 'approved';
    const saved = await this.letters.save(row);
    this.logger.log(`Letter ${letterId} approved (subject="${saved.subject}")`);
    return saved;
  }

  // ───────────────────────── internals ─────────────────────────

  /**
   * Read the bytes behind a `SourceFile` row as text. We deliberately keep
   * this simple in Wave 2: UTF-8 decode + truncate at
   * `MAX_INCOMING_LETTER_BYTES`. A PDF text-extractor is out of scope
   * (Wave 3 will plug pdf-parse if the contract calls for it). If the file
   * cannot be read, the persona still gets a placeholder so the audit
   * trail is intact — refusing to draft because storage is offline is
   * worse than drafting from a known-empty body.
   */
  private async readSourceFileText(source: SourceFile): Promise<string> {
    if (!source.storedPath) {
      return `[storage path empty for source file ${source.id} (${source.filename})]`;
    }
    if (!existsSync(source.storedPath)) {
      this.logger.warn(
        `Stored path missing for source file ${source.id} (${source.storedPath})`,
      );
      return `[stored bytes unavailable for source file ${source.id} (${source.filename})]`;
    }
    try {
      const buf = await fs.readFile(source.storedPath);
      const text = buf.toString('utf8', 0, Math.min(buf.byteLength, MAX_INCOMING_LETTER_BYTES));
      return text || `[empty body for source file ${source.id}]`;
    } catch (err) {
      this.logger.warn(
        `Failed to read source file ${source.id}: ${(err as Error).message}`,
      );
      return `[storage read error for source file ${source.id}]`;
    }
  }

  /**
   * Validate the citations returned by the persona against the curated
   * `SourceRegistry`. Throws `LetterDrafterRejection('missing-citations')`
   * for an empty array and `LetterDrafterRejection('unknown-citation')`
   * when any cited id is not in the registry.
   *
   * The returned array is the **deduplicated, validated** citation list
   * the entity persists. Caller MUST use this return value, not the raw
   * persona result, so a fabricated id never ends up on a `Letter` row.
   */
  private async validateCitations(result: PersonaCallResult): Promise<string[]> {
    if (!result.citations || result.citations.length === 0) {
      throw new LetterDrafterRejection(
        'missing-citations',
        `Persona ${result.personaSlug} v${result.personaVersion} returned no [SOURCE: id] ` +
          `citations — Wave 2 forbids persisting a letter without at least one source.`,
      );
    }

    for (const externalId of result.citations) {
      try {
        await this.sources.findByExternalId(externalId);
      } catch {
        throw new LetterDrafterRejection(
          'unknown-citation',
          `Persona cited source "${externalId}" which is not in the SourceRegistry — ` +
            `treated as a fabricated citation and the draft is rejected.`,
        );
      }
    }

    // Deduplicate while preserving order (the persona response already
    // dedupes, but defending against a future ClaudeService change).
    return [...new Set(result.citations)];
  }

  /**
   * Parse the persona's response into the structured fields the `Letter`
   * entity expects. The persona is prompted (in `personas/fidic-redbook-expert.md`)
   * to return a JSON envelope when asked for structured output. We accept
   * either:
   *
   *   (a) a JSON block delimited by ```json … ``` fences, or
   *   (b) a bare JSON object at the start of the response, or
   *   (c) a free-form draft with the `Subject:` / `Sub-Clause:` / `بالعربية:` /
   *       `In English:` markers — fallback parsing keeps an offline test setup
   *       (no real Claude) shippable.
   *
   * If neither shape is found we throw `LetterDrafterRejection('unparseable-response')`
   * rather than persist garbage.
   */
  private parsePersonaDraft(content: string): ParsedLetterDraft {
    if (!content?.trim()) {
      throw new LetterDrafterRejection(
        'unparseable-response',
        'Persona returned an empty body — cannot persist a letter with no content.',
      );
    }

    // (a) + (b) JSON paths.
    const jsonShape = this.tryParseJsonEnvelope(content);
    if (jsonShape) return jsonShape;

    // (c) Marker-based fallback. The persona is told to label sections;
    // the regexes below are deliberately lenient (case + whitespace + colon
    // variants). We never throw on a missing optional section — only on a
    // missing body, which is what makes the letter useless.
    const subject = this.extractAfter(content, /^(?:Subject|الموضوع)\s*[:：]\s*(.+)$/im) ?? '';
    const fidicClauseRef =
      this.extractAfter(
        content,
        /^(?:Sub-?Clause|البند(?:\s+الفرعي)?|FIDIC\s+Clause)\s*[:：]\s*(.+)$/im,
      ) ?? null;
    const deadlineRaw = this.extractAfter(
      content,
      /^(?:Deadline|المهلة|Response\s+Deadline)\s*[:：]\s*(.+)$/im,
    );
    const deadlineDays = this.parseDeadline(deadlineRaw);
    const bodyAr = this.extractBlock(content, /(?:بالعربية|Arabic|عربي)\s*[:：]?/i);
    const bodyEn = this.extractBlock(content, /(?:In\s+English|English|بالإنجليزية|إنجليزي)\s*[:：]?/i);

    if (!bodyAr && !bodyEn) {
      throw new LetterDrafterRejection(
        'unparseable-response',
        'Persona response contained neither an Arabic body nor an English body — ' +
          'cannot construct a Letter row.',
      );
    }

    return {
      subject: subject || 'Draft Reply',
      bodyAr: bodyAr || '',
      bodyEn: bodyEn || '',
      fidicClauseRef,
      deadlineDays,
    };
  }

  /** Match either ```json …``` fenced block or a leading bare JSON object. */
  private tryParseJsonEnvelope(content: string): ParsedLetterDraft | null {
    const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(content);
    const candidate = fenceMatch?.[1] ?? this.leadingObject(content);
    if (!candidate) return null;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      return null;
    }
    if (typeof parsed !== 'object' || parsed === null) return null;

    const bodyAr =
      (parsed.draftReplyAr as string | undefined) ??
      (parsed.bodyAr as string | undefined) ??
      '';
    const bodyEn =
      (parsed.draftReplyEn as string | undefined) ??
      (parsed.bodyEn as string | undefined) ??
      '';
    if (!bodyAr && !bodyEn) return null;

    const fidicRaw =
      (parsed.applicableSubClause as string | undefined) ??
      (parsed.fidicClauseRef as string | undefined) ??
      null;
    const bookEdition = parsed.bookEdition as string | undefined;
    const fidicClauseRef =
      fidicRaw && bookEdition ? `${fidicRaw} [${bookEdition}]` : fidicRaw;

    const deadlineDays = this.parseDeadline(
      (parsed.deadlineDays as unknown)?.toString?.() ?? null,
    );

    return {
      subject:
        (parsed.subject as string | undefined) ??
        (parsed.title as string | undefined) ??
        'Draft Reply',
      bodyAr,
      bodyEn,
      fidicClauseRef: fidicClauseRef ?? null,
      deadlineDays,
    };
  }

  /** Extract the leading {…} JSON object if the response starts with one. */
  private leadingObject(content: string): string | null {
    const trimmed = content.trimStart();
    if (!trimmed.startsWith('{')) return null;
    let depth = 0;
    for (let i = 0; i < trimmed.length; i += 1) {
      const ch = trimmed[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) return trimmed.slice(0, i + 1);
      }
    }
    return null;
  }

  private extractAfter(content: string, re: RegExp): string | null {
    const m = re.exec(content);
    return m ? m[1].trim() : null;
  }

  /**
   * Extract the body of a labelled section: lines after the label, up to the
   * next labelled section or the end of the response. Trims leading blank
   * lines.
   */
  private extractBlock(content: string, labelRe: RegExp): string {
    const labelMatch = labelRe.exec(content);
    if (!labelMatch) return '';
    const start = labelMatch.index + labelMatch[0].length;
    // Next section label = `Word:` at the start of a line. We stop at the
    // next colon-labelled section so the bodies do not collide.
    const tail = content.slice(start);
    const nextLabel = /\n\s*(?:Subject|Sub-?Clause|Deadline|الموضوع|البند|المهلة|In\s+English|English|بالعربية|بالإنجليزية|Arabic|عربي|إنجليزي)\s*[:：]/i.exec(
      tail,
    );
    const slice = nextLabel ? tail.slice(0, nextLabel.index) : tail;
    return slice.trim();
  }

  /**
   * Parse a deadline string into a day count or null. Accepts:
   *  - `28`             → 28
   *  - `"28"`           → 28
   *  - `"28 days"`      → 28
   *  - `"TBD"`          → null
   *  - `"TBD pending data"` → null
   *  - null / ""        → null
   */
  private parseDeadline(raw: string | number | null | undefined): number | null {
    if (raw == null) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (/^tbd\b/i.test(trimmed)) return null;
    const m = /(\d+)/.exec(trimmed);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  /** Build the user message for an incoming-letter draft. */
  private buildIncomingDraftPrompt(projectKey: string, filename: string): string {
    return (
      `أنت في صفحة GOVERNANCE داخل منصة سيجما PMO، تعمل على المشروع \`${projectKey}\`. ` +
      `الخطاب المُرفَق في الكتلة \`<untrusted_contractor_letter>\` هو خطاب وارد من المقاول، ` +
      `الملف الأصلي: \`${filename}\`. \n\n` +
      `المطلوب: استخرج البند الفرعي المنطبق من الكتاب الأحمر (مع إصداره)، احسب المهلة التعاقدية بالأيام ` +
      `(أو "TBD pending data" مع تعداد المفقود)، وسوِّد ردّاً رسمياً بالعربية الفصحى ثم بالإنجليزية. ` +
      `استشهد بكل بند بصيغة [SOURCE: <externalId>] حيث \`<externalId>\` من سجل المصادر المعتمد ` +
      `(مثلاً \`fidic-red-1999\` أو \`fidic-red-2017\`). أعد الإجابة بصيغة JSON بالحقول المعرفة في ` +
      `نظام التعليمات (applicableSubClause, bookEdition, deadlineDays, draftReplyAr, draftReplyEn, ` +
      `contradictions, missingInputs, confidence).`
    );
  }

  /** Build the user message for a compliance-flag draft. */
  private buildComplianceDraftPrompt(projectKey: string, trigger: string): string {
    return (
      `أنت في صفحة GOVERNANCE داخل منصة سيجما PMO، تعمل على المشروع \`${projectKey}\`. ` +
      `أُثير علم عدم امتثال بكود \`${trigger}\` بناءً على قاعدة حوكمة آلية. ` +
      `المطلوب: سوِّد خطاب إخطار رسمي للمقاول (عربي ثم إنجليزي) يستند للبند المنطبق من الكتاب الأحمر ` +
      `أو لمعيار PMI/ISO إن لزم، مع الاستشهاد بـ [SOURCE: <externalId>] من سجل المصادر. ` +
      `إذا كانت المهلة التعاقدية متاحة من سياق الـ Trigger، اذكرها بوضوح؛ وإلا اكتب "TBD pending data". ` +
      `أعد الإجابة بصيغة JSON بالحقول: applicableSubClause, bookEdition, deadlineDays, ` +
      `draftReplyAr, draftReplyEn, subject, missingInputs.`
    );
  }

  /** Persist a parsed + validated draft. Always lands in `status='draft'`. */
  private async persistDraft(input: {
    projectKey: string;
    trigger: LetterTrigger;
    incomingLetterSourceFileId: string | null;
    subject: string;
    bodyAr: string;
    bodyEn: string;
    fidicClauseRef: string | null;
    deadlineDays: number | null;
    citations: string[];
  }): Promise<Letter> {
    if (input.citations.length === 0) {
      // Should never happen — validateCitations already threw. Belt + braces.
      throw new InternalServerErrorException(
        'persistDraft called with empty citations; should have been rejected upstream',
      );
    }
    const row = this.letters.create({
      projectBusinessKey: input.projectKey,
      incomingLetterSourceFileId: input.incomingLetterSourceFileId,
      trigger: input.trigger,
      subject: input.subject,
      bodyAr: input.bodyAr,
      bodyEn: input.bodyEn,
      fidicClauseRef: input.fidicClauseRef,
      deadlineDays: input.deadlineDays,
      status: 'draft',
      citations: input.citations,
    });
    const saved = await this.letters.save(row);
    this.logger.log(
      `Letter ${saved.id} drafted (trigger=${input.trigger}, project=${input.projectKey}, ` +
        `clause=${input.fidicClauseRef ?? 'n/a'}, citations=${input.citations.length})`,
    );
    return saved;
  }
}

/** Structured shape pulled out of a persona response. Private to the module. */
interface ParsedLetterDraft {
  subject: string;
  bodyAr: string;
  bodyEn: string;
  fidicClauseRef: string | null;
  deadlineDays: number | null;
}
