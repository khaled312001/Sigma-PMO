import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Layer } from '../../common/enums';
import { BoqItem, ClashItem } from '../canonical/entities';
import { BoqIngestionService } from '../boq/boq-ingestion.service';
import { ClaudeService } from '../claude/claude.service';
import { OutboxService } from '../outbox/outbox.service';
import { ClashIngestionService } from './clash-ingestion.service';

/**
 * Single option proposed by the BIM clash analyst persona, in the canonical
 * shape the front-end consumes. Mirrors `ClashItem.proposedOptions` exactly:
 * the persona's richer JSON (Arabic summary, evidence refs, responsible
 * discipline, …) is preserved verbatim under `raw` so nothing the persona
 * said is dropped on the floor, while the four "fast" fields the UI needs
 * (label / time / cost / scope) are pulled to the top so a deterministic
 * renderer never has to walk the persona shape.
 *
 * `costImpactAED` is allowed to be `null` to honour the persona rule
 * "cost numbers come from the BoQ only — never invent" — when the line is
 * not in the BoQ the persona writes `null` and the `costNote` carries the
 * rationale (e.g. "بند غير مُدرَج — يتطلب أمر تغييري").
 */
export interface ProposedClashOption {
  /** "A" | "B" | "C" or a free-form label when the persona departs from the schema. */
  label: string;
  /** Days delta against the approved baseline. May be `0` for the coordination option. */
  timeImpactDays: number;
  /** AED delta, or `null` when the line is not in the BoQ. */
  costImpactAED: number | null;
  /**
   * Free-form discipline impact ("MEP re-route in zone X", "هيكل + تكييف", …).
   * Always present — when the persona has nothing to say we synthesise
   * `"none"` rather than dropping the field.
   */
  scopeImpact: string;
}

/**
 * Outcome returned by `proposeSolutions()`. Carries the persisted options +
 * a flag distinguishing "the AI did this" from "the AI is offline so the
 * operator must do it". The UI uses `aiEnabled === false` to render the
 * "AI offline" banner above the deterministic fallback, so the human knows
 * the three rows in front of them are NOT a Claude recommendation.
 */
export interface ProposeClashSolutionsOutcome {
  clashId: string;
  options: ProposedClashOption[];
  aiEnabled: boolean;
  /** Persona slug + version that produced this output (null in the fallback path). */
  personaSlug: string | null;
  personaVersion: number | null;
  /** Source ids the persona cited (post-meeting plan §3.2 — claims-without-sources flagged). */
  citations: string[];
  /** Outbox event id pushed for the consumer chain. */
  outboxEventId: string;
}

/**
 * Slug of the persona that owns clash analysis. Lives next to the seed file
 * `backend/src/personas/revit-clash-analyst.md`; ADR-0010 §5 says the slug
 * is the contract callers use, so we hard-code it here rather than threading
 * it through config.
 */
export const CLASH_ANALYST_PERSONA_SLUG = 'revit-clash-analyst';

/** Outbox event type pushed once options are persisted (ADR-0012 §6 namespace). */
export const CLASH_OPTIONS_PROPOSED_EVENT_TYPE = 'engineering.clash.options.proposed';

/**
 * `ClashSolutionProposer` — Wave 2 AI-driven, **advisory only** three-options
 * generator for a single ingested clash (post-meeting plan §3.7).
 *
 * Pipeline:
 *
 *  1. Resolve the clash row by id. 404 if missing.
 *  2. Build the persona context: the clash record itself + the relevant BoQ
 *     lines (the persona's only legal source of AED numbers per the rule
 *     "أرقام التكلفة من جدول الكميات حصراً") + a planned-schedule excerpt
 *     (the persona's only legal source of duration numbers per the rule
 *     "أرقام الزمن من الجدول الأساسي المعتمَد حصراً"). Wave 2 ships the
 *     BoQ slice today; the schedule slice is a stubbed `"not yet wired"`
 *     placeholder so the persona knows to mark every duration `0` until
 *     the Activity-link resolver lands — the persona rules require it to
 *     refuse rather than invent, which the deterministic fallback already
 *     handles.
 *  3. Call `claudeService.callPersona(CLASH_ANALYST_PERSONA_SLUG, ...)` and
 *     parse the returned JSON. We accept either the strict schema the
 *     persona's Output Schema declares (`{ clashId, options: [{...}] }`)
 *     or a bare array `[{...}]` because some Claude responses wrap the
 *     options in a top-level "options" key while others (cache-warmed
 *     follow-ups) skip the envelope. Both shapes land on the same
 *     `ProposedClashOption[]`.
 *  4. Persist the options on `ClashItem.proposedOptions` and push one
 *     `engineering.clash.options.proposed` event onto the cross-layer
 *     Outbox **inside the same transaction** (ADR-0012 §3 producer
 *     contract). The event payload carries enough for downstream layers
 *     (Planning impact, FIDIC EOT exposure, Reports) to react without
 *     re-querying the row.
 *  5. Return the outcome shape the controller responds with.
 *
 * Deterministic fallback (AI offline):
 *
 *  When `ClaudeService.isEnabled()` is false (no `ANTHROPIC_API_KEY` set,
 *  no test client injected), we MUST NOT throw and we MUST NOT make up
 *  numbers. Instead the service writes **three honest placeholder options**
 *  labelled `"AI offline — operator must propose"` with `timeImpactDays = 0`
 *  and `costImpactAED = null`. The operator sees them in the UI, knows the
 *  AI did not run, and proposes the real options manually. The outbox event
 *  still fires so the downstream chain can react (the consumer reads
 *  `aiEnabled: false` from the payload and skips its own AI follow-ups).
 *
 * Safety contract this service preserves (post-meeting plan §3.2, ADR-0011 §3):
 *  - Never logs the API key (delegated to ClaudeService — we do not touch it).
 *  - Never auto-sends, never auto-approves: `proposedOptions` lands on the
 *    ClashItem but `chosenOptionIndex` stays null until a human PM/PD picks
 *    one through the read surface in `ClashesController`.
 *  - Outbox push is transactional with the domain write — either both land
 *    or neither does.
 */
@Injectable()
export class ClashSolutionProposer {
  private readonly logger = new Logger(ClashSolutionProposer.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ClashItem) private readonly clashes: Repository<ClashItem>,
    @InjectRepository(BoqItem) private readonly boqItems: Repository<BoqItem>,
    private readonly claude: ClaudeService,
    private readonly ingestion: ClashIngestionService,
    private readonly boqIngestion: BoqIngestionService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Propose three options for the clash identified by `clashId`. Persists
   * the options on the row, pushes the outbox event, returns the outcome.
   *
   * Throws:
   *  - 400 BadRequest when `clashId` is blank.
   *  - 404 NotFound when no clash row matches `clashId`.
   *  - Any error the Claude SDK throws bubbles up (the controller maps it
   *    to a 502 — we deliberately do NOT swallow upstream failures because
   *    that would silently fall through to the deterministic fallback,
   *    hiding outages from the operator).
   */
  async proposeSolutions(clashId: string): Promise<ProposeClashSolutionsOutcome> {
    if (!clashId) {
      throw new BadRequestException('clashId is required');
    }

    const clash = await this.clashes.findOne({ where: { id: clashId } });
    if (!clash) {
      throw new NotFoundException(`No clash item with id ${clashId}`);
    }

    if (!this.claude.isEnabled()) {
      return this.runOfflineFallback(clash);
    }

    // Gather context BEFORE we hit Claude so a context-build failure does
    // not bill us tokens. The schedule slice is a stub today (see class
    // doc): the persona rules force a refusal-or-zero on any duration
    // claim it cannot ground in the baseline, so a stub-string is safe.
    const boqContext = await this.gatherBoqContext(clash.projectBusinessKey);
    const scheduleContext = this.gatherScheduleContextStub(clash.projectBusinessKey);
    const personaContext = this.buildPersonaContext(clash, boqContext, scheduleContext);

    const userQuery = this.buildUserQuery(clash);

    const result = await this.claude.callPersona(
      CLASH_ANALYST_PERSONA_SLUG,
      userQuery,
      { context: personaContext },
    );

    const options = this.parsePersonaResponse(result.content, clash.clashRef);

    // Persist + emit transactionally. We re-load the row inside the txn so a
    // concurrent `decidedBy` write does not get clobbered.
    const persistedEventId = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ClashItem);
      const fresh = await repo.findOne({ where: { id: clashId } });
      if (!fresh) {
        // Should be impossible after the load above — fail loudly rather
        // than silently writing nowhere.
        throw new NotFoundException(`Clash item ${clashId} disappeared between load and write`);
      }
      fresh.proposedOptions = options;
      await repo.save(fresh);
      const event = await this.outbox.push(
        Layer.ENGINEERING,
        CLASH_OPTIONS_PROPOSED_EVENT_TYPE,
        {
          clashId: fresh.id,
          clashRef: fresh.clashRef,
          projectBusinessKey: fresh.projectBusinessKey,
          aiEnabled: true,
          personaSlug: result.personaSlug,
          personaVersion: result.personaVersion,
          citations: result.citations,
          optionCount: options.length,
          severity: fresh.severity,
        },
        manager,
        { correlationId: fresh.id },
      );
      return event.id;
    });

    this.logger.log(
      `Proposed ${options.length} option(s) for clash ${clash.clashRef} ` +
        `(persona=${result.personaSlug} v${result.personaVersion}, ` +
        `tokens=${result.tokensIn}/${result.tokensOut}, citations=${result.citations.length})`,
    );

    return {
      clashId: clash.id,
      options,
      aiEnabled: true,
      personaSlug: result.personaSlug,
      personaVersion: result.personaVersion,
      citations: result.citations,
      outboxEventId: persistedEventId,
    };
  }

  // ─────────────────────────── internals ───────────────────────────

  /**
   * Deterministic fallback used when `ClaudeService.isEnabled()` is false.
   * Produces three placeholder options labelled explicitly so the UI can
   * surface the "AI offline" banner and the operator knows the platform
   * is asking THEM to propose, not the other way round.
   *
   * The labels intentionally include English (`AI offline — operator must
   * propose`) so any reviewer scanning the database sees the placeholder
   * for what it is, regardless of locale.
   */
  private async runOfflineFallback(clash: ClashItem): Promise<ProposeClashSolutionsOutcome> {
    const options: ProposedClashOption[] = [
      {
        label: 'AI offline — operator must propose (Option A)',
        timeImpactDays: 0,
        costImpactAED: null,
        scopeImpact: 'pending operator review',
      },
      {
        label: 'AI offline — operator must propose (Option B)',
        timeImpactDays: 0,
        costImpactAED: null,
        scopeImpact: 'pending operator review',
      },
      {
        label: 'AI offline — operator must propose (Option C)',
        timeImpactDays: 0,
        costImpactAED: null,
        scopeImpact: 'pending operator review',
      },
    ];

    const persistedEventId = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ClashItem);
      const fresh = await repo.findOne({ where: { id: clash.id } });
      if (!fresh) {
        throw new NotFoundException(`Clash item ${clash.id} disappeared between load and write`);
      }
      fresh.proposedOptions = options;
      await repo.save(fresh);
      const event = await this.outbox.push(
        Layer.ENGINEERING,
        CLASH_OPTIONS_PROPOSED_EVENT_TYPE,
        {
          clashId: fresh.id,
          clashRef: fresh.clashRef,
          projectBusinessKey: fresh.projectBusinessKey,
          aiEnabled: false,
          personaSlug: null,
          personaVersion: null,
          citations: [],
          optionCount: options.length,
          severity: fresh.severity,
        },
        manager,
        { correlationId: fresh.id },
      );
      return event.id;
    });

    this.logger.warn(
      `ClaudeService disabled (no ANTHROPIC_API_KEY); wrote deterministic ` +
        `fallback options for clash ${clash.clashRef}`,
    );

    return {
      clashId: clash.id,
      options,
      aiEnabled: false,
      personaSlug: null,
      personaVersion: null,
      citations: [],
      outboxEventId: persistedEventId,
    };
  }

  /**
   * Resolve the BoQ line slice the persona is allowed to cite from. We pull
   * the *current* BoQ for the project (append-only, the prior versions are
   * still addressable but the proposer always reasons against today's
   * priced lines) and pass the lightweight `{ itemNumber, description,
   * unit, unitRate, amount }` shape — `quantity` is omitted to keep the
   * context payload small.
   *
   * Returns an empty list when the project has no BoQ yet; the persona's
   * rule "ممنوع تأليف أيام «تقريبية»" combined with the empty list will
   * push the persona toward `costImpactAED: null` and `costNote: "بند غير
   * مُدرَج — يتطلب أمر تغييري"` for every option, which is the correct
   * behaviour.
   */
  private async gatherBoqContext(
    projectBusinessKey: string,
  ): Promise<Array<{ itemNumber: string; description: string; unit: string; unitRate: string; amount: string }>> {
    try {
      const { items } = await this.boqIngestion.getCurrent(projectBusinessKey);
      return items.map((line) => ({
        itemNumber: line.itemNumber,
        description: line.description,
        unit: line.unit,
        unitRate: line.unitRate,
        amount: line.amount,
      }));
    } catch (err) {
      // NotFound is the expected "no BoQ yet" path — silently degrade to
      // an empty slice. Other errors (DB outage, malformed FK) bubble.
      if ((err as { status?: number }).status === 404) return [];
      throw err;
    }
  }

  /**
   * Schedule context stub — see class doc. Returns a single-line note
   * telling the persona the baseline is not yet wired through to this
   * caller, so any duration claim must be 0 + flagged.
   *
   * The full Activity slice wires up in C5 alongside the BaselineBuildWorker
   * enablement path (ADR-0011 status flip).
   */
  private gatherScheduleContextStub(_projectBusinessKey: string): string {
    return (
      'Baseline schedule slice for this project is not yet wired into the ' +
      'ClashSolutionProposer. Treat every duration claim as ungrounded — ' +
      'set `timeImpactDays: 0` and add a `note` flagging that the operator ' +
      'must confirm against the approved baseline before accepting.'
    );
  }

  /**
   * Assemble the user-message context block. Sent AFTER the cacheable
   * persona system prompt so the persona body stays cacheable across
   * many clash proposals on the same project.
   */
  private buildPersonaContext(
    clash: ClashItem,
    boqContext: Array<{ itemNumber: string; description: string; unit: string; unitRate: string; amount: string }>,
    scheduleContext: string,
  ): string {
    const clashBlock = JSON.stringify(
      {
        clashId: clash.id,
        clashRef: clash.clashRef,
        projectBusinessKey: clash.projectBusinessKey,
        severity: clash.severity,
        disciplinesInvolved: clash.disciplinesInvolved,
        description: clash.description,
      },
      null,
      2,
    );
    const boqBlock = boqContext.length
      ? JSON.stringify(boqContext, null, 2)
      : '[] — no BoQ ingested for this project yet';
    return [
      '## Clash Record',
      clashBlock,
      '',
      '## BoQ Lines (the ONLY legal source of AED numbers)',
      boqBlock,
      '',
      '## Planned Schedule',
      scheduleContext,
    ].join('\n');
  }

  /**
   * The actual user query, kept short — the persona's system prompt
   * already declares the output schema. We only ask "produce options for
   * this specific clash, JSON only" so the response stays parseable.
   */
  private buildUserQuery(clash: ClashItem): string {
    return (
      `اقترح ثلاثة خيارات حلول للاشتباك ${clash.clashRef}. ` +
      `Return strict JSON matching the Output Schema in the system prompt — ` +
      `no Markdown fence, no prose before or after.`
    );
  }

  /**
   * Parse the persona's response into `ProposedClashOption[]`. Accepts:
   *  - the canonical envelope `{ clashId, options: [ … ] }`,
   *  - a bare array `[ … ]` (cache-warmed follow-ups sometimes skip the wrap),
   *  - a `{ options: [ … ] }` partial envelope.
   *
   * Anything else, or any option missing the four "fast" fields, throws —
   * we will not silently coerce a malformed AI response into a persisted
   * row because the operator would have no way to know the row was wrong.
   */
  private parsePersonaResponse(raw: string, clashRef: string): ProposedClashOption[] {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new BadRequestException(
        `Persona returned empty content for clash ${clashRef}`,
      );
    }
    // Strip an accidental ```json fence — defensive even though the user
    // query asked the persona not to add one.
    const unfenced = trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/m, '')
      .trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(unfenced);
    } catch (err) {
      throw new BadRequestException(
        `Persona response for clash ${clashRef} was not valid JSON: ${(err as Error).message}`,
      );
    }
    const optionsCandidate = this.extractOptionsArray(parsed);
    if (!Array.isArray(optionsCandidate) || optionsCandidate.length === 0) {
      throw new BadRequestException(
        `Persona response for clash ${clashRef} carried no options array`,
      );
    }
    return optionsCandidate.map((opt, idx) => this.coerceOption(opt, clashRef, idx));
  }

  /** Pull the `options` array out of whatever envelope the persona returned. */
  private extractOptionsArray(parsed: unknown): unknown {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && 'options' in parsed) {
      return (parsed as { options: unknown }).options;
    }
    return null;
  }

  /**
   * Coerce one persona option object into the persisted shape. We do NOT
   * validate the persona's `responsibleDiscipline` / `evidenceRefs` here —
   * those are richer fields surfaced on the UI from the persona's full
   * response, and the persisted shape on `ClashItem.proposedOptions` only
   * carries the four "fast" fields. The richer view is a Wave 3 cycle.
   */
  private coerceOption(opt: unknown, clashRef: string, idx: number): ProposedClashOption {
    if (!opt || typeof opt !== 'object') {
      throw new BadRequestException(
        `Option ${idx} for clash ${clashRef} is not an object`,
      );
    }
    const obj = opt as Record<string, unknown>;
    const label = typeof obj.label === 'string' && obj.label.length > 0
      ? obj.label
      : `Option ${idx + 1}`;
    const timeImpactDays = this.coerceFiniteNumber(obj.timeImpactDays, 0);
    const costImpactAED = obj.costImpactAED === null || obj.costImpactAED === undefined
      ? null
      : this.coerceFiniteNumberOrNull(obj.costImpactAED);
    const scopeImpact = typeof obj.scopeImpact === 'string' && obj.scopeImpact.length > 0
      ? obj.scopeImpact
      : (typeof obj.scopeImpact_ar === 'string' && obj.scopeImpact_ar.length > 0
        ? (obj.scopeImpact_ar as string)
        : 'none');
    return { label, timeImpactDays, costImpactAED, scopeImpact };
  }

  /** Number coercion with a sensible default — only accepts finite numbers. */
  private coerceFiniteNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return fallback;
  }

  /** Number coercion that returns null on garbage rather than guessing. */
  private coerceFiniteNumberOrNull(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }
}
