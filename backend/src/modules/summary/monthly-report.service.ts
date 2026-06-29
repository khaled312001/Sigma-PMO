import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  Activity,
  Alert,
  BoQ,
  ConfidenceScore,
  FeasibilityAssessment,
  GovernanceDecision,
  InvestmentOpportunity,
  MonthlyReport,
  Project,
  SiteEvidence,
} from '../canonical/entities';
import { ProjectOwnershipService } from '../canonical/project-ownership.service';
import { ClaudeService } from '../claude/claude.service';
import { Communication } from '../communications/communication.entity';
import { SnapshotService } from '../rules/snapshot.service';
import { ProjectSnapshot } from '../rules/types';
import { SourcesService } from '../sources/sources.service';
import { MetricsSummary, PdfRendererService } from './pdf-renderer.service';

/** Audience the report is written for. */
export type MonthlyReportAudience = 'owner' | 'pd' | 'contractor';

/** Cadence — Wave 4 introduced daily + weekly variants alongside monthly. */
export type PeriodicCadence = 'day' | 'week' | 'month';

/**
 * Narrative composition flavour. `executive` is the legacy default; the others
 * re-shape the deterministic section composition (governance/investment/
 * portfolio focus) without touching the deterministic-first contract.
 */
export type MonthlyReportNarrativeType = 'executive' | 'governance' | 'investment' | 'portfolio';

/** Input to `generateMonthly`. */
export interface MonthlyReportRequest {
  projectKey: string;
  /** Calendar month in `YYYY-MM` form. */
  monthIso: string;
  audience: MonthlyReportAudience;
  /** Narrative composition; defaults to `executive` (legacy behaviour). */
  narrativeType?: MonthlyReportNarrativeType;
  /** Optional author override (sigma_admin = `system` when unset). */
  authoredBy?: string | null;
}

/** Input to the cadence-aware `generatePeriodic` (Wave 4). */
export interface PeriodicReportRequest {
  projectKey: string;
  cadence: PeriodicCadence;
  /**
   * Exact period key:
   *  - `month` → `YYYY-MM`
   *  - `week`  → `YYYY-Www` (ISO week, e.g. `2026-W23`)
   *  - `day`   → `YYYY-MM-DD`
   */
  periodKey: string;
  audience: MonthlyReportAudience;
  /** Narrative composition; defaults to `executive` (legacy behaviour). */
  narrativeType?: MonthlyReportNarrativeType;
  authoredBy?: string | null;
}

/** Persona slug Wave 2 pins for monthly narratives (post-meeting plan §3.6). */
const REPORT_PERSONA_SLUG = 'report-narrator-arabic';

/** English-edition narrator (Wave 7, correction-plan §2.8) — same facts, independent prose. */
const REPORT_PERSONA_SLUG_EN = 'report-narrator-english';

/** Tier override — Owner/PD reports get Opus, Contractor stays on Sonnet. */
const TIER_BY_AUDIENCE: Record<MonthlyReportAudience, string> = {
  owner: 'claude-opus',
  pd: 'claude-opus',
  contractor: 'claude-sonnet',
};

/**
 * Monthly Narrative Report builder — the Layer-4 output Al Ayham asked for
 * on 2026-06-08: full-sentence prose, three stakeholder views of the same
 * facts, PDF format, citations against the curated SourceRegistry.
 *
 * **Architectural contract (deterministic-first):**
 *  1. Build a deterministic facts block from the canonical snapshot + alerts +
 *     governance decisions + BoQ + confidence scores. This block is the source
 *     of truth — the LLM never sees raw rows it can hallucinate against.
 *  2. If `ClaudeService.isEnabled()`, call `report-narrator-arabic` with the
 *     facts as `context` and an audience-tailored user query. The persona is
 *     instructed (in its system prompt) to:
 *       - open with a 3-line "Executive Verdict",
 *       - write connected paragraphs (not bullets) at a senior PMO register,
 *       - cite at least one `[SOURCE: id]` per professional claim,
 *       - refuse silently if asked to fabricate or expose another audience's
 *         view.
 *  3. After the call, run the citation guard: an `llm` row with zero citations
 *     is rejected as a refusal-style violation and the deterministic
 *     facts block is persisted instead. The Wave-2 plan calls this "fail
 *     closed on citations".
 *  4. Persist a `MonthlyReport` row. PDF rendering is a separate explicit step
 *     — the controller's `/pdf` endpoint triggers it on demand so a report can
 *     be regenerated without re-rendering its PDF.
 *
 * **What this service does NOT do:**
 *  - It does NOT auto-send the report anywhere. The Wave-2 envelope forbids
 *    that until the human approval gate lands (post-meeting plan §3.6, §4.4).
 *  - It does NOT mutate canonical truth — the snapshot is read-only and the
 *    persisted row carries only narrative + metrics + audit metadata.
 */
@Injectable()
export class MonthlyReportService {
  private readonly logger = new Logger(MonthlyReportService.name);

  constructor(
    @InjectRepository(MonthlyReport) private readonly reports: Repository<MonthlyReport>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(GovernanceDecision)
    private readonly decisions: Repository<GovernanceDecision>,
    @InjectRepository(ConfidenceScore)
    private readonly confidences: Repository<ConfidenceScore>,
    @InjectRepository(BoQ) private readonly boqs: Repository<BoQ>,
    @InjectRepository(InvestmentOpportunity)
    private readonly opportunities: Repository<InvestmentOpportunity>,
    @InjectRepository(FeasibilityAssessment)
    private readonly assessments: Repository<FeasibilityAssessment>,
    private readonly snapshots: SnapshotService,
    private readonly claude: ClaudeService,
    private readonly sources: SourcesService,
    private readonly pdf: PdfRendererService,
    // Optional only so the existing positional unit specs construct without it;
    // NestJS DI always injects it at runtime (CanonicalModule exports it).
    private readonly ownership?: ProjectOwnershipService,
    // Optional (positional-spec compat) — communication evidence for the report.
    @InjectRepository(Communication) private readonly comms?: Repository<Communication>,
    // Optional (positional-spec compat) — site-evidence captures for the report.
    @InjectRepository(SiteEvidence) private readonly siteEvidence?: Repository<SiteEvidence>,
  ) {}

  /**
   * Generate one monthly report for the (project, month, audience) triple.
   * Thin wrapper over `generatePeriodic` — kept so the Wave 2 callsite (and
   * its DTO) does not have to learn about cadence.
   */
  generateMonthly(req: MonthlyReportRequest): Promise<MonthlyReport> {
    return this.generatePeriodic({
      projectKey: req.projectKey,
      cadence: 'month',
      periodKey: req.monthIso,
      audience: req.audience,
      narrativeType: req.narrativeType,
      authoredBy: req.authoredBy,
    });
  }

  /**
   * Cadence-aware generation (Wave 4). Daily and weekly reports reuse the
   * exact monthly pipeline — deterministic facts block → optional persona
   * rewrite → citation guard → row insert — only the window changes.
   *
   * Each call inserts a NEW row; historical drafts stay queryable via
   * `list()` with the matching `periodKey`.
   */
  async generatePeriodic(req: PeriodicReportRequest): Promise<MonthlyReport> {
    const window = resolvePeriodWindow(req.cadence, req.periodKey);
    const narrativeType: MonthlyReportNarrativeType = req.narrativeType ?? 'executive';
    const project = await this.resolveProject(req.projectKey);
    const snapshot = await this.snapshots.load(project.id);

    const [alertsInWindow, decisionsInWindow, confidenceAverage, boq, commsInWindow, evidenceInWindow] = await Promise.all([
      this.loadAlertsInWindow(snapshot, window.startIso, window.endIso),
      this.loadDecisionsInWindow(snapshot, window.startIso, window.endIso),
      this.averageConfidenceFor(snapshot),
      this.loadCurrentBoq(project.businessKey),
      this.loadCommunicationsInWindow(project.businessKey, window.startIso, window.endIso),
      this.loadSiteEvidenceInWindow(project.businessKey, window.startIso, window.endIso),
    ]);

    // Narrative-type-specific deterministic blocks (loaded only when needed).
    const investmentRows =
      narrativeType === 'investment' ? await this.loadLatestFeasibility() : [];
    const portfolioRows: PortfolioTotals[] =
      narrativeType === 'portfolio' ? [await this.loadPortfolioTotals()] : [];

    const metrics = buildMetrics(
      snapshot,
      alertsInWindow,
      decisionsInWindow,
      boq,
      confidenceAverage,
      req.cadence,
      req.periodKey,
      narrativeType,
    );
    Object.assign(metrics, buildCommunicationMetrics(commsInWindow));
    Object.assign(metrics, buildSiteEvidenceMetrics(evidenceInWindow));
    const facts =
      composeFacts(
        snapshot,
        alertsInWindow,
        decisionsInWindow,
        boq,
        confidenceAverage,
        req.cadence,
        req.periodKey,
        req.audience,
      ) +
      composeNarrativeTypeSection(narrativeType, {
        decisions: decisionsInWindow,
        alerts: alertsInWindow,
        investment: investmentRows,
        portfolio: portfolioRows,
      }) +
      composeCommunicationsSection(commsInWindow) +
      composeSiteEvidenceSection(evidenceInWindow);

    let narrative = facts;
    let narrativeAr: string | null = facts;
    let narrativeEn: string | null = null;
    let narrativeSource: 'deterministic' | 'llm' = 'deterministic';
    let personaVersion = 1;
    let llmModel: string | null = null;
    let citations: string[] = [];

    if (this.claude.isEnabled()) {
      // Bilingual generation (Wave 7, correction-plan §2.8): the Arabic and
      // English narrators write INDEPENDENTLY from the same facts — the
      // English edition is a first-class deliverable, not a translation.
      const [ar, en] = await Promise.all([
        this.tryClaude(facts, req.audience, project.name, req.cadence, project.businessKey, REPORT_PERSONA_SLUG),
        this.tryClaude(facts, req.audience, project.name, req.cadence, project.businessKey, REPORT_PERSONA_SLUG_EN),
      ]);
      if (ar) {
        narrative = ar.narrative;
        narrativeAr = ar.narrative;
        narrativeSource = 'llm';
        personaVersion = ar.personaVersion;
        llmModel = ar.model;
        citations = ar.citations;
      }
      if (en) {
        narrativeEn = en.narrative;
        citations = [...new Set([...citations, ...en.citations])];
        // English-only success still counts as llm output.
        if (!ar) {
          narrativeSource = 'llm';
          personaVersion = en.personaVersion;
          llmModel = en.model;
        }
      }
    }

    if (narrativeSource === 'llm' && citations.length === 0) {
      this.logger.warn(
        `${req.cadence} narrative for ${project.businessKey}/${req.periodKey}/${req.audience} ` +
          `produced 0 citations — falling back to deterministic facts.`,
      );
      narrative = facts;
      narrativeAr = facts;
      narrativeEn = null;
      narrativeSource = 'deterministic';
      llmModel = null;
      citations = [];
    }

    citations = await this.filterToKnownSources(citations);

    const row = this.reports.create({
      projectBusinessKey: project.businessKey,
      month: window.monthForLegacyFilter,
      cadence: req.cadence,
      periodKey: req.periodKey,
      audience: req.audience,
      personaSlug: REPORT_PERSONA_SLUG,
      personaVersion,
      narrativeSource,
      llmModel,
      narrative,
      narrativeAr,
      narrativeEn,
      metrics,
      citations,
      pdfStoredPath: null,
      status: 'generated',
    });
    const saved = await this.reports.save(row);
    this.logger.log(
      `${req.cadence} report ${saved.id} generated for ` +
        `${project.businessKey}/${req.periodKey}/${req.audience} ` +
        `(${narrativeSource}, ${citations.length} citations)`,
    );
    return saved;
  }

  /**
   * List reports for a project, optionally filtered by month (coarse) and/or
   * cadence + periodKey (exact). Newest first.
   */
  list(
    projectKey: string,
    month?: string,
    cadence?: PeriodicCadence,
    periodKey?: string,
  ): Promise<MonthlyReport[]> {
    const where: Record<string, unknown> = { projectBusinessKey: projectKey };
    if (month) where.month = month;
    if (cadence) where.cadence = cadence;
    if (periodKey) where.periodKey = periodKey;
    return this.reports.find({
      where,
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async getById(id: string): Promise<MonthlyReport> {
    const row = await this.reports.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`No monthly report with id ${id}`);
    await this.ownership?.assertOwns(row.projectBusinessKey); // multi-tenant ownership
    return row;
  }

  /**
   * Render the row's PDF on demand. Sets `pdfStoredPath` + flips status to
   * `pdf-rendered` if needed. Returns the absolute disk path so the
   * controller can stream it.
   */
  async renderPdf(
    id: string,
    language: 'ar' | 'en' = 'ar',
  ): Promise<{ row: MonthlyReport; absolutePath: string }> {
    const row = await this.getById(id);
    const project = await this.projects.findOne({
      where: { businessKey: row.projectBusinessKey, isCurrent: true },
    });
    const projectName = project?.name ?? row.projectBusinessKey;
    const metricsSummary = buildMetricsSummary(row.metrics);
    // Daily/weekly rows print their `periodKey`; monthly stays as `month`.
    const periodLabel = row.periodKey ?? row.month;
    // Edition selection (Wave 7): `ar` falls back to the legacy `narrative`
    // column on pre-Wave-7 rows; `en` requires the English edition to exist.
    const narrative =
      language === 'en' ? row.narrativeEn : (row.narrativeAr ?? row.narrative);
    if (!narrative) {
      throw new NotFoundException(
        `Report ${id} has no ${language === 'en' ? 'English' : 'Arabic'} edition — ` +
          `regenerate the report with Claude enabled to produce both editions.`,
      );
    }
    const result = await this.pdf.render(`${row.id}-${language}`, {
      projectName,
      projectBusinessKey: row.projectBusinessKey,
      month: periodLabel,
      audience: row.audience,
      narrative,
      metricsSummary,
      citations: row.citations,
      personaSlug: language === 'en' ? 'report-narrator-english' : row.personaSlug,
      personaVersion: row.personaVersion,
      narrativeSource: row.narrativeSource,
      fullMetrics: row.metrics,
    });
    row.pdfStoredPath = result.storedPath;
    row.status = 'pdf-rendered';
    await this.reports.save(row);
    return { row, absolutePath: this.pdf.resolveAbsolutePath(result.storedPath) };
  }

  // ───────────────────────── internals ─────────────────────────

  private async tryClaude(
    facts: string,
    audience: MonthlyReportAudience,
    projectName: string,
    cadence: PeriodicCadence,
    projectKey?: string,
    personaSlug: string = REPORT_PERSONA_SLUG,
  ): Promise<{ narrative: string; citations: string[]; personaVersion: number; model: string } | null> {
    try {
      const userMessage =
        personaSlug === REPORT_PERSONA_SLUG_EN
          ? buildUserQueryEn(audience, projectName, cadence)
          : buildUserQuery(audience, projectName, cadence);
      // Cadence importance: monthly (most) > weekly > daily — drop the daily
      // call to the lighter tier even for owner/PD to keep cost sane on the
      // daily heartbeat, while monthly + weekly keep their audience tier.
      const tier = cadence === 'day' ? 'claude-sonnet' : TIER_BY_AUDIENCE[audience];
      const result = await this.claude.callPersona(personaSlug, userMessage, {
        context: facts,
        modelTier: tier,
        projectKey,
        surface: 'reports',
      });
      return {
        narrative: result.content,
        citations: result.citations,
        personaVersion: result.personaVersion,
        model: result.model,
      };
    } catch (err) {
      this.logger.warn(
        `Claude call failed for ${cadence} report (${personaSlug}): ${(err as Error).message}`,
      );
      return null;
    }
  }

  private async resolveProject(projectKey: string): Promise<Project> {
    const project = await this.projects.findOne({
      where: { businessKey: projectKey, isCurrent: true },
    });
    if (!project) throw new NotFoundException(`No current project with key "${projectKey}"`);
    return project;
  }


  private async loadAlertsInWindow(
    snapshot: ProjectSnapshot,
    periodStart: string,
    periodEnd: string,
  ): Promise<Alert[]> {
    const projectIds = await this.allProjectVersionIds(snapshot.project.businessKey);
    const rows = await this.alerts.find({
      where: { projectId: In(projectIds) },
      order: { createdAt: 'DESC' },
      take: 500,
    });
    const startMs = new Date(`${periodStart}T00:00:00Z`).getTime();
    const endMs = new Date(`${periodEnd}T23:59:59Z`).getTime();
    return rows.filter((a) => {
      const t = new Date(a.createdAt).getTime();
      return t >= startMs && t <= endMs;
    });
  }

  private async loadDecisionsInWindow(
    snapshot: ProjectSnapshot,
    periodStart: string,
    periodEnd: string,
  ): Promise<GovernanceDecision[]> {
    void snapshot;
    const startMs = new Date(`${periodStart}T00:00:00Z`).getTime();
    const endMs = new Date(`${periodEnd}T23:59:59Z`).getTime();
    const rows = await this.decisions.find({ order: { createdAt: 'DESC' }, take: 500 });
    return rows.filter((d) => {
      const t = new Date(d.createdAt).getTime();
      return t >= startMs && t <= endMs;
    });
  }

  private async loadCurrentBoq(projectBusinessKey: string): Promise<BoQ | null> {
    return this.boqs.findOne({
      where: { businessKey: `boq:${projectBusinessKey}`, isCurrent: true },
    });
  }

  /**
   * Communication-evidence input — project communications registered in the
   * period. Surfaced in the governance report so unread/escalated/disputed
   * notices are reflected alongside schedule, alerts and decisions. Best-effort:
   * returns [] when the repo isn't wired (positional unit specs).
   */
  private async loadCommunicationsInWindow(
    projectBusinessKey: string,
    startIso: string,
    endIso: string,
  ): Promise<Communication[]> {
    if (!this.comms) return [];
    const rows = await this.comms.find({
      where: { projectBusinessKey },
      order: { createdAt: 'DESC' },
      take: 500,
    });
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    return rows.filter((c) => {
      const t = new Date(c.sentAt ?? c.createdAt).getTime();
      return t >= start && t <= end;
    });
  }

  /**
   * Site-evidence input — photo / video / audio / transcript captures registered
   * in the period (Mr. Ayham acceptance 2026-06-28). Surfaced in the governance
   * report so on-site evidence — and any safety/quality finding it raised — is
   * reflected alongside schedule, alerts and decisions. Best-effort: returns []
   * when the repo isn't wired (positional unit specs). Windowed by `reportDate`
   * (the daily-rollup date) with `capturedAt` / `createdAt` as fallbacks.
   */
  private async loadSiteEvidenceInWindow(
    projectBusinessKey: string,
    startIso: string,
    endIso: string,
  ): Promise<SiteEvidence[]> {
    if (!this.siteEvidence) return [];
    const rows = await this.siteEvidence.find({
      where: { projectBusinessKey },
      order: { createdAt: 'DESC' },
      take: 500,
    });
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    return rows.filter((e) => {
      const ref = e.reportDate ?? e.capturedAt ?? e.createdAt;
      const t = new Date(ref).getTime();
      return Number.isFinite(t) && t >= start && t <= end;
    });
  }

  /**
   * Investment narrative input — the latest `FeasibilityAssessment` per
   * `InvestmentOpportunity`, paired with its opportunity for titling. Read-only
   * across the canonical Investment & Feasibility entities.
   */
  private async loadLatestFeasibility(): Promise<LatestFeasibility[]> {
    const opportunities = await this.opportunities.find({ order: { createdAt: 'DESC' }, take: 50 });
    if (opportunities.length === 0) return [];
    const assessments = await this.assessments.find({
      where: { opportunityId: In(opportunities.map((o) => o.id)) },
      order: { createdAt: 'DESC' },
    });
    const latestByOpp = new Map<string, FeasibilityAssessment>();
    for (const a of assessments) {
      if (!latestByOpp.has(a.opportunityId)) latestByOpp.set(a.opportunityId, a);
    }
    return opportunities
      .map((o) => ({ opportunity: o, assessment: latestByOpp.get(o.id) ?? null }))
      .filter((row): row is LatestFeasibility => row.assessment !== null);
  }

  /**
   * Portfolio narrative input — cross-project deterministic totals (BAC / EV /
   * AC) and status counts over every current project. EV is the
   * progress-weighted earned value (Σ actualPct × budgetedCost across current
   * activities); AC is Σ actualCost; BAC is Σ budgetedCost.
   */
  private async loadPortfolioTotals(): Promise<PortfolioTotals> {
    const projects = await this.projects.find({ where: { isCurrent: true } });
    const byStatus: Record<string, number> = {};
    let bac = 0;
    let ev = 0;
    let ac = 0;
    for (const project of projects) {
      const status = project.status ?? 'unknown';
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      const snapshot = await this.snapshots.load(project.id);
      for (const a of snapshot.activities) {
        const budgeted = a.budgetedCost === null ? 0 : Number(a.budgetedCost);
        const actual = a.actualCost === null ? 0 : Number(a.actualCost);
        const pct = a.actualPctComplete ?? 0;
        if (Number.isFinite(budgeted)) {
          bac += budgeted;
          ev += budgeted * pct;
        }
        if (Number.isFinite(actual)) ac += actual;
      }
    }
    return { projectCount: projects.length, byStatus, bac, ev, ac };
  }

  private async averageConfidenceFor(snapshot: ProjectSnapshot): Promise<number> {
    const runIds = new Set<string>();
    runIds.add(snapshot.project.ingestionRunId);
    for (const a of snapshot.activities) runIds.add(a.ingestionRunId);
    for (const r of snapshot.resources) runIds.add(r.ingestionRunId);
    for (const r of snapshot.reports) runIds.add(r.ingestionRunId);
    for (const a of snapshot.assignments) runIds.add(a.ingestionRunId);
    if (runIds.size === 0) return 0;
    const scores = await this.confidences.find({ where: { ingestionRunId: In([...runIds]) } });
    if (scores.length === 0) return 0;
    return scores.reduce((acc, s) => acc + s.overall, 0) / scores.length;
  }

  private async allProjectVersionIds(businessKey: string): Promise<string[]> {
    const versions = await this.projects.find({
      where: { businessKey },
      select: { id: true },
    });
    return versions.map((v) => v.id);
  }

  /**
   * Keep only citations whose externalId resolves in the curated registry.
   * Unknown ids are dropped (and logged) — the persona is not allowed to
   * invent a SOURCE marker against a non-existent reference.
   */
  private async filterToKnownSources(citations: string[]): Promise<string[]> {
    if (citations.length === 0) return citations;
    const kept: string[] = [];
    for (const id of citations) {
      try {
        await this.sources.findByExternalId(id);
        kept.push(id);
      } catch {
        this.logger.warn(`Dropping unknown citation id "${id}" — not in SourceRegistry.`);
      }
    }
    return kept;
  }
}

// ───────────────────────── helpers (pure) ─────────────────────────

/** Resolved period window — start/end ISO dates + a month key for the legacy filter. */
interface PeriodWindow {
  startIso: string;
  endIso: string;
  monthForLegacyFilter: string;
}

/**
 * Translate a cadence + periodKey into an absolute (start, end) day window.
 * Daily: the day itself. Weekly: Monday–Sunday of that ISO week. Monthly:
 * 1st–last day of the calendar month.
 */
export function resolvePeriodWindow(cadence: PeriodicCadence, periodKey: string): PeriodWindow {
  if (cadence === 'month') {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)) {
      throw new NotFoundException(
        `monthly periodKey (monthIso) must be YYYY-MM, got "${periodKey}"`,
      );
    }
    const [y, m] = periodKey.split('-').map((s) => Number.parseInt(s, 10));
    const last = new Date(Date.UTC(y, m, 0));
    return {
      startIso: `${periodKey}-01`,
      endIso: last.toISOString().slice(0, 10),
      monthForLegacyFilter: periodKey,
    };
  }
  if (cadence === 'day') {
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(periodKey)) {
      throw new NotFoundException(`daily periodKey must be YYYY-MM-DD, got "${periodKey}"`);
    }
    return {
      startIso: periodKey,
      endIso: periodKey,
      monthForLegacyFilter: periodKey.slice(0, 7),
    };
  }
  if (cadence === 'week') {
    const m = /^(\d{4})-W(0[1-9]|[1-4]\d|5[0-3])$/.exec(periodKey);
    if (!m) {
      throw new NotFoundException(`weekly periodKey must be YYYY-Www, got "${periodKey}"`);
    }
    const year = Number.parseInt(m[1], 10);
    const week = Number.parseInt(m[2], 10);
    const monday = isoWeekMonday(year, week);
    const sunday = new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    const startIso = monday.toISOString().slice(0, 10);
    const endIso = sunday.toISOString().slice(0, 10);
    return {
      startIso,
      endIso,
      monthForLegacyFilter: startIso.slice(0, 7),
    };
  }
  throw new NotFoundException(`Unknown cadence "${cadence as string}"`);
}

/** Monday (UTC) of the given ISO year + week number. */
function isoWeekMonday(year: number, week: number): Date {
  // ISO 8601: week 1 contains the year's first Thursday.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday;
}

/** Arabic cadence label used in the prompt. */
function cadenceLabelAr(cadence: PeriodicCadence): string {
  switch (cadence) {
    case 'day':
      return 'اليومي';
    case 'week':
      return 'الأسبوعي';
    case 'month':
      return 'الشهري';
  }
}

/** Latest feasibility assessment paired with its opportunity (investment type). */
interface LatestFeasibility {
  opportunity: InvestmentOpportunity;
  assessment: FeasibilityAssessment;
}

/** Cross-project deterministic totals (portfolio type). */
interface PortfolioTotals {
  projectCount: number;
  byStatus: Record<string, number>;
  bac: number;
  ev: number;
  ac: number;
}

/**
 * Append a narrative-type-specific deterministic section to the facts block.
 * `executive` adds nothing (legacy composition). The other three re-focus the
 * deterministic facts the persona is grounded on:
 *  - `governance`  — escalations + corrective actions + decision breakdown.
 *  - `investment`  — latest feasibility recommendations per opportunity.
 *  - `portfolio`   — cross-project BAC/EV/AC totals + status mix.
 *
 * Pure — no I/O. The caller pre-loads the rows and hands them in.
 */
function composeNarrativeTypeSection(
  narrativeType: MonthlyReportNarrativeType,
  data: {
    decisions: GovernanceDecision[];
    alerts: Alert[];
    investment: LatestFeasibility[];
    portfolio: PortfolioTotals[];
  },
): string {
  const lines: string[] = [];
  if (narrativeType === 'governance') {
    lines.push('');
    lines.push('### Narrative focus — GOVERNANCE');
    const byLevel: Record<string, number> = {};
    for (const d of data.decisions) byLevel[d.escalationLevel] = (byLevel[d.escalationLevel] ?? 0) + 1;
    const escalated = data.decisions.filter((d) => d.escalationLevel === 'L3').length;
    lines.push(
      `- Decisions in window ${data.decisions.length}; by level ` +
        `${Object.entries(byLevel).map(([k, v]) => `${k}:${v}`).join(', ') || 'none'}.`,
    );
    lines.push(`- Highest-tier (L3) escalations: ${escalated}.`);
    const critical = data.alerts.filter((a) => a.severity === 'critical').length;
    lines.push(`- Critical alerts driving corrective action: ${critical}.`);
    for (const d of data.decisions.slice(0, 6)) {
      lines.push(
        `  - ${d.escalationLevel} · ${d.responsibleParty}` +
          (d.fidicClause ? ` · FIDIC ${d.fidicClause}` : '') +
          ` — ${d.rationale.slice(0, 160)}`,
      );
    }
  } else if (narrativeType === 'investment') {
    lines.push('');
    lines.push('### Narrative focus — INVESTMENT & FEASIBILITY');
    if (data.investment.length === 0) {
      lines.push('- No investment opportunities with a feasibility assessment on file.');
    } else {
      for (const row of data.investment.slice(0, 10)) {
        const r = row.assessment.results as Record<string, unknown>;
        const npv = r?.npv ?? 'n/a';
        const irr = r?.projectIrr ?? r?.equityIrr ?? 'n/a';
        lines.push(
          `- ${row.opportunity.code} "${row.opportunity.title}" (${row.opportunity.projectType}) — ` +
            `recommendation ${row.assessment.recommendation} [${row.assessment.governanceStatus}], ` +
            `risk ${row.assessment.riskRating}, NPV ${String(npv)}, IRR ${String(irr)}, ` +
            `confidence ${(row.assessment.confidence * 100).toFixed(0)}%.`,
        );
      }
    }
  } else if (narrativeType === 'portfolio') {
    lines.push('');
    lines.push('### Narrative focus — PORTFOLIO');
    const totals = data.portfolio[0];
    if (!totals || totals.projectCount === 0) {
      lines.push('- No current projects to aggregate.');
    } else {
      const cpi = totals.ac > 0 ? totals.ev / totals.ac : null;
      lines.push(`- Projects in portfolio: ${totals.projectCount}.`);
      lines.push(
        `- BAC ${totals.bac.toFixed(0)}; EV ${totals.ev.toFixed(0)}; AC ${totals.ac.toFixed(0)}` +
          (cpi !== null ? ` (CPI ${cpi.toFixed(2)}).` : '.'),
      );
      lines.push(
        `- Status mix: ${
          Object.entries(totals.byStatus).map(([k, v]) => `${k}:${v}`).join(', ') || 'n/a'
        }.`,
      );
    }
  }
  return lines.length === 0 ? '' : '\n' + lines.join('\n');
}

/**
 * Communication-evidence facts (Mr. Ayham, 2026-06-19). Reflects registered
 * project communications in the period: totals by category, unopened/overdue,
 * escalated, disputed and required-acknowledgement notices — the auditable
 * communication trail linked to claims/approvals/delays in the governance report.
 */
function composeCommunicationsSection(comms: Communication[]): string {
  if (!comms.length) return '';
  const now = Date.now();
  const byCategory = new Map<string, number>();
  let unopened = 0, overdue = 0, escalated = 0, disputed = 0, ackRequired = 0, ackOutstanding = 0, deemed = 0;
  for (const c of comms) {
    byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + 1);
    const ageH = c.sentAt ? (now - new Date(c.sentAt).getTime()) / 3_600_000 : 0;
    if (!c.openedAt) { unopened++; if (ageH > 24) overdue++; }
    if (c.escalatedAt) escalated++;
    if (c.disputedAt) disputed++;
    if (c.deemedServedAt) deemed++;
    if (c.requiresAck) { ackRequired++; if (!c.acknowledgedAt) ackOutstanding++; }
  }
  const cats = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
  const lines: string[] = [];
  lines.push('');
  lines.push('### Communications evidence');
  lines.push(`- Registered in window: ${comms.length} (by category: ${cats}).`);
  lines.push(`- Unopened in Sigma: ${unopened}; overdue (>24h): ${overdue}.`);
  lines.push(`- Acknowledgement required: ${ackRequired}; outstanding: ${ackOutstanding}.`);
  lines.push(`- Escalated: ${escalated}; deemed-served: ${deemed}; disputed: ${disputed}.`);
  const critical = comms
    .filter((c) => c.escalatedAt || c.disputedAt || (!c.openedAt && c.sentAt && (now - new Date(c.sentAt).getTime()) / 3_600_000 > 24))
    .slice(0, 8);
  for (const c of critical) {
    const linked = c.linkedClaimKey || c.linkedRecordKey ? ` [linked: ${c.linkedClaimKey ?? c.linkedRecordKey}]` : '';
    const state = c.disputedAt ? 'disputed' : c.escalatedAt ? `escalated L${c.escalationLevel ?? 1}` : 'overdue-unopened';
    lines.push(`  - ${c.commId} (${c.category}, ${state})${linked}: ${c.subject.slice(0, 80)}.`);
  }
  return lines.join('\n');
}

function buildCommunicationMetrics(comms: Communication[]): Record<string, unknown> {
  const byCategory: Record<string, number> = {};
  let unopened = 0, escalated = 0, disputed = 0, ackOutstanding = 0;
  for (const c of comms) {
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
    if (!c.openedAt) unopened++;
    if (c.escalatedAt) escalated++;
    if (c.disputedAt) disputed++;
    if (c.requiresAck && !c.acknowledgedAt) ackOutstanding++;
  }
  return {
    communicationCount: comms.length,
    communicationsByCategory: byCategory,
    communicationsUnopened: unopened,
    communicationsEscalated: escalated,
    communicationsDisputed: disputed,
    communicationsAckOutstanding: ackOutstanding,
  };
}

/**
 * Site-evidence facts (Mr. Ayham acceptance 2026-06-28). Reflects the on-site
 * captures registered in the period: counts by media kind, by location/activity,
 * geotag presence, transcript snippets, and how many were promoted to a
 * safety/quality finding (with the raised record's id) — the auditable on-site
 * evidence trail linked to the governance report.
 */
function composeSiteEvidenceSection(evidence: SiteEvidence[]): string {
  if (!evidence.length) return '';
  const byKind = new Map<string, number>();
  const byLocation = new Map<string, number>();
  const byActivity = new Map<string, number>();
  let geotagged = 0;
  let safetyFindings = 0;
  let qualityFindings = 0;
  for (const e of evidence) {
    byKind.set(e.mediaKind, (byKind.get(e.mediaKind) ?? 0) + 1);
    const loc = e.locationLabel ?? 'unlabelled';
    byLocation.set(loc, (byLocation.get(loc) ?? 0) + 1);
    if (e.activityKey) byActivity.set(e.activityKey, (byActivity.get(e.activityKey) ?? 0) + 1);
    if (e.latitude !== null && e.longitude !== null) geotagged++;
    if (e.findingType === 'safety') safetyFindings++;
    if (e.findingType === 'quality') qualityFindings++;
  }
  const kinds = [...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
  const locs = [...byLocation.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${v}`).join(', ');
  const lines: string[] = [];
  lines.push('');
  lines.push('### Site evidence');
  lines.push(`- Captured in window: ${evidence.length} (by kind: ${kinds}).`);
  lines.push(`- Locations: ${locs}; geotagged: ${geotagged}; linked activities: ${byActivity.size}.`);
  lines.push(`- Findings raised: ${safetyFindings} safety, ${qualityFindings} quality.`);
  // List captures that raised a finding (the governance-relevant ones) first,
  // then any with a transcript snippet, capped for the deterministic block.
  const flagged = evidence.filter((e) => e.findingType);
  for (const e of flagged.slice(0, 8)) {
    const rec =
      e.findingType === 'safety'
        ? e.linkedSafetyRecordId
        : e.findingType === 'quality'
          ? e.linkedQualityRecordId
          : null;
    const loc = e.locationLabel ? ` @ ${e.locationLabel}` : '';
    const recRef = rec ? ` [record: ${rec}]` : '';
    lines.push(`  - ${e.mediaKind} ${e.filename}${loc} → ${e.findingType} finding${recRef}.`);
  }
  const transcripts = evidence.filter((e) => e.transcriptText && !e.findingType).slice(0, 3);
  for (const e of transcripts) {
    const snippet = (e.transcriptText ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
    lines.push(`  - ${e.mediaKind} transcript: "${snippet}".`);
  }
  return lines.join('\n');
}

function buildSiteEvidenceMetrics(evidence: SiteEvidence[]): Record<string, unknown> {
  const byKind: Record<string, number> = {};
  let geotagged = 0;
  let safetyFindings = 0;
  let qualityFindings = 0;
  for (const e of evidence) {
    byKind[e.mediaKind] = (byKind[e.mediaKind] ?? 0) + 1;
    if (e.latitude !== null && e.longitude !== null) geotagged++;
    if (e.findingType === 'safety') safetyFindings++;
    if (e.findingType === 'quality') qualityFindings++;
  }
  return {
    siteEvidenceCount: evidence.length,
    siteEvidenceByKind: byKind,
    siteEvidenceGeotagged: geotagged,
    siteEvidenceSafetyFindings: safetyFindings,
    siteEvidenceQualityFindings: qualityFindings,
  };
}

/**
 * Compose the deterministic facts block. This is the source of truth — the
 * persona is instructed never to make claims beyond what this block says.
 */
function composeFacts(
  snapshot: ProjectSnapshot,
  alerts: Alert[],
  decisions: GovernanceDecision[],
  boq: BoQ | null,
  confidence: number,
  cadence: PeriodicCadence,
  periodKey: string,
  audience: MonthlyReportAudience,
): string {
  const { project, activities } = snapshot;
  const completed = activities.filter((a) => (a.actualPctComplete ?? 0) >= 1).length;
  const inProgress = activities.filter(
    (a) => (a.actualPctComplete ?? 0) > 0 && (a.actualPctComplete ?? 0) < 1,
  ).length;
  const notStarted = activities.filter((a) => (a.actualPctComplete ?? 0) <= 0).length;

  const plannedAvg = avg(
    activities.map((a) => a.plannedPctComplete).filter((n): n is number => n !== null),
  );
  const actualAvg = avg(
    activities.map((a) => a.actualPctComplete).filter((n): n is number => n !== null),
  );
  const deltaPp =
    plannedAvg !== null && actualAvg !== null ? (actualAvg - plannedAvg) * 100 : null;

  const critical = alerts.filter((a) => a.severity === 'critical');
  const warnings = alerts.filter((a) => a.severity === 'warning');

  const lines: string[] = [];
  lines.push(
    `## Deterministic facts — ${audience.toUpperCase()} view — ${cadence.toUpperCase()} ${periodKey}`,
  );
  lines.push('');
  lines.push(`Project: ${project.name} (businessKey ${project.businessKey}).`);
  if (project.dataDate) lines.push(`Schedule data date: ${project.dataDate}.`);
  if (project.plannedStart && project.plannedFinish) {
    lines.push(`Planned duration: ${project.plannedStart} → ${project.plannedFinish}.`);
  }
  lines.push('');
  lines.push('### Schedule');
  lines.push(`- Activities tracked: ${activities.length}.`);
  lines.push(`- Completed: ${completed}; in progress: ${inProgress}; not started: ${notStarted}.`);
  if (plannedAvg !== null && actualAvg !== null) {
    lines.push(
      `- Average planned progress ${(plannedAvg * 100).toFixed(1)}% vs actual ${(actualAvg * 100).toFixed(1)}% ` +
        `(delta ${(deltaPp ?? 0).toFixed(1)} pp).`,
    );
  }
  lines.push('');
  lines.push('### Alerts opened or active in window');
  lines.push(`- Total ${alerts.length}; critical ${critical.length}; warning ${warnings.length}.`);
  for (const a of critical.slice(0, 8)) {
    lines.push(`  - [${a.code}] ${a.summary}`);
  }
  lines.push('');
  lines.push('### Governance decisions in window');
  if (decisions.length === 0) {
    lines.push('- No governance decisions issued this month.');
  } else {
    for (const d of decisions.slice(0, 8)) {
      lines.push(
        `- ${d.escalationLevel} — ${d.responsibleParty}` +
          (d.fidicClause ? ` (FIDIC ${d.fidicClause})` : '') +
          ` — ${d.rationale.slice(0, 200)}`,
      );
    }
  }
  lines.push('');
  lines.push('### Bill of Quantities');
  if (boq) {
    lines.push(
      `- Current BoQ ${boq.businessKey} v${boq.version}: total ${boq.currency} ${boq.totalAmount ?? 'n/a'}.`,
    );
  } else {
    lines.push('- No current BoQ on file for this project.');
  }
  lines.push('');
  lines.push(`### Data confidence`);
  lines.push(`- Average across this project's ingestion runs: ${(confidence * 100).toFixed(1)}%.`);

  if (audience === 'contractor') {
    lines.push('');
    lines.push(
      '### Audience constraint — CONTRACTOR slice',
    );
    lines.push(
      '- Do not surface owner-only commentary, other contractors, or the project-wide financial position.',
    );
  }
  if (audience === 'owner') {
    lines.push('');
    lines.push('### Audience constraint — OWNER one-pager');
    lines.push(
      '- Three-line executive verdict + one paragraph context + top-3 risks + 3–5 sentence forward look.',
    );
  }
  if (audience === 'pd') {
    lines.push('');
    lines.push('### Audience constraint — PROJECT DIRECTOR detail');
    lines.push(
      '- 5–10 pages: every open Alert, every decision in window, per-WBS narrative.',
    );
  }

  return lines.join('\n');
}

/** Compose the user-message prompt sent to the persona on top of the facts. */
function buildUserQuery(
  audience: MonthlyReportAudience,
  projectName: string,
  cadence: PeriodicCadence,
): string {
  const intro = `اكتب التقرير ${cadenceLabelAr(cadence)} لمشروع "${projectName}" للنسخة المخصّصة لـ ${audienceLabelAr(audience)}.`;
  const rules =
    'اعتمد فقط على الحقائق الموجودة في "Deterministic facts" أعلاه. لا تستحضر معلومات خارجية. ' +
    'كل ادعاء مهني يجب أن يحمل علامة استشهاد [SOURCE: id] من قائمة المصادر المعتمدة (FIDIC, PMBOK, ISO, AACE, BIM, Primavera). ' +
    'افتح بـ"الحكم التنفيذي" في ثلاثة أسطر. اكتب فقرات سرديّة مترابطة، لا نقاط، باستثناء "أبرز الأرقام" و"أكبر ثلاث مخاطر". ' +
    'اختم بفقرة "نظرة استشرافية" 3–5 جُمل مرتبطة بالمسار الحرج وبالتنبيهات المفتوحة.';
  return `${intro}\n\n${rules}`;
}

/** English-edition user query (Wave 7 — same rules, English register). */
function buildUserQueryEn(
  audience: MonthlyReportAudience,
  projectName: string,
  cadence: PeriodicCadence,
): string {
  const cadenceLabel = cadence === 'day' ? 'daily' : cadence === 'week' ? 'weekly' : 'monthly';
  return (
    `Write the ${cadenceLabel} report for project "${projectName}", ${audience.toUpperCase()} view. ` +
    `Ground every claim ONLY in the "Deterministic facts" above — no external knowledge. ` +
    `Attach a [SOURCE: id] citation marker from the curated registry (FIDIC, PMBOK, ISO, AACE, BIM, Primavera) to every professional claim. ` +
    `Open with the 3-line Executive Verdict. Write connected prose, not bullets — bullets only in "Key figures" and "Top-3 risks". ` +
    `Close with a 3-5 sentence forward look anchored in the critical path and the open alerts.`
  );
}

function audienceLabelAr(audience: MonthlyReportAudience): string {
  switch (audience) {
    case 'owner':
      return 'المالك (Owner)';
    case 'pd':
      return 'مدير المشروع (Project Director)';
    case 'contractor':
      return 'المقاول الرئيسي (Main Contractor)';
    default:
      return audience;
  }
}

function buildMetrics(
  snapshot: ProjectSnapshot,
  alerts: Alert[],
  decisions: GovernanceDecision[],
  boq: BoQ | null,
  confidence: number,
  cadence: PeriodicCadence,
  periodKey: string,
  narrativeType: MonthlyReportNarrativeType,
): Record<string, unknown> {
  const byCode: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const a of alerts) {
    byCode[a.code] = (byCode[a.code] ?? 0) + 1;
    bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
  }
  const plannedAvg = avg(
    snapshot.activities.map((a) => a.plannedPctComplete).filter((n): n is number => n !== null),
  );
  const actualAvg = avg(
    snapshot.activities.map((a) => a.actualPctComplete).filter((n): n is number => n !== null),
  );
  const deltaPp =
    plannedAvg !== null && actualAvg !== null ? (actualAvg - plannedAvg) * 100 : null;
  return {
    cadence,
    periodKey,
    narrativeType,
    activityCount: snapshot.activities.length,
    alertCount: alerts.length,
    alertsByCode: byCode,
    alertsBySeverity: bySeverity,
    criticalAlertCount: bySeverity.critical ?? 0,
    warningAlertCount: bySeverity.warning ?? 0,
    decisionCount: decisions.length,
    decisionsByLevel: decisions.reduce<Record<string, number>>((acc, d) => {
      acc[d.escalationLevel] = (acc[d.escalationLevel] ?? 0) + 1;
      return acc;
    }, {}),
    boqCurrency: boq?.currency ?? null,
    boqTotalAmount: boq?.totalAmount ?? null,
    boqVersion: boq?.version ?? null,
    confidenceAverage: confidence,
    plannedAverage: plannedAvg,
    actualAverage: actualAvg,
    scheduleDeltaPp: deltaPp,
  };
}

/** Build the small metrics-summary the PDF cover prints. */
function buildMetricsSummary(metrics: Record<string, unknown>): MetricsSummary {
  const m = metrics as Record<string, unknown>;
  const boqCurrency = (m.boqCurrency as string | null) ?? null;
  const boqTotalAmount = (m.boqTotalAmount as string | null) ?? null;
  const boqTotalDisplay =
    boqCurrency && boqTotalAmount ? `${boqCurrency} ${formatThousands(boqTotalAmount)}` : null;
  return {
    activityCount: Number(m.activityCount ?? 0),
    alertCount: Number(m.alertCount ?? 0),
    criticalAlertCount: Number(m.criticalAlertCount ?? 0),
    warningAlertCount: Number(m.warningAlertCount ?? 0),
    confidenceAverage: Number(m.confidenceAverage ?? 0),
    boqTotalDisplay,
    scheduleDeltaPp: m.scheduleDeltaPp === null ? null : Number(m.scheduleDeltaPp ?? 0),
  };
}

function formatThousands(amount: string): string {
  const [whole, frac] = amount.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
