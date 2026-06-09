import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  Activity,
  Alert,
  BoQ,
  ConfidenceScore,
  GovernanceDecision,
  MonthlyReport,
  Project,
} from '../canonical/entities';
import { ClaudeService } from '../claude/claude.service';
import { SnapshotService } from '../rules/snapshot.service';
import { ProjectSnapshot } from '../rules/types';
import { SourcesService } from '../sources/sources.service';
import { MetricsSummary, PdfRendererService } from './pdf-renderer.service';

/** Audience the report is written for. */
export type MonthlyReportAudience = 'owner' | 'pd' | 'contractor';

/** Cadence — Wave 4 introduced daily + weekly variants alongside monthly. */
export type PeriodicCadence = 'day' | 'week' | 'month';

/** Input to `generateMonthly`. */
export interface MonthlyReportRequest {
  projectKey: string;
  /** Calendar month in `YYYY-MM` form. */
  monthIso: string;
  audience: MonthlyReportAudience;
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
  authoredBy?: string | null;
}

/** Persona slug Wave 2 pins for monthly narratives (post-meeting plan §3.6). */
const REPORT_PERSONA_SLUG = 'report-narrator-arabic';

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
    private readonly snapshots: SnapshotService,
    private readonly claude: ClaudeService,
    private readonly sources: SourcesService,
    private readonly pdf: PdfRendererService,
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
    const project = await this.resolveProject(req.projectKey);
    const snapshot = await this.snapshots.load(project.id);

    const [alertsInWindow, decisionsInWindow, confidenceAverage, boq] = await Promise.all([
      this.loadAlertsInWindow(snapshot, window.startIso, window.endIso),
      this.loadDecisionsInWindow(snapshot, window.startIso, window.endIso),
      this.averageConfidenceFor(snapshot),
      this.loadCurrentBoq(project.businessKey),
    ]);

    const metrics = buildMetrics(
      snapshot,
      alertsInWindow,
      decisionsInWindow,
      boq,
      confidenceAverage,
      req.cadence,
      req.periodKey,
    );
    const facts = composeFacts(
      snapshot,
      alertsInWindow,
      decisionsInWindow,
      boq,
      confidenceAverage,
      req.cadence,
      req.periodKey,
      req.audience,
    );

    let narrative = facts;
    let narrativeSource: 'deterministic' | 'llm' = 'deterministic';
    let personaVersion = 1;
    let llmModel: string | null = null;
    let citations: string[] = [];

    if (this.claude.isEnabled()) {
      const llm = await this.tryClaude(facts, req.audience, project.name, req.cadence);
      if (llm) {
        narrative = llm.narrative;
        narrativeSource = 'llm';
        personaVersion = llm.personaVersion;
        llmModel = llm.model;
        citations = llm.citations;
      }
    }

    if (narrativeSource === 'llm' && citations.length === 0) {
      this.logger.warn(
        `${req.cadence} narrative for ${project.businessKey}/${req.periodKey}/${req.audience} ` +
          `produced 0 citations — falling back to deterministic facts.`,
      );
      narrative = facts;
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
    return row;
  }

  /**
   * Render the row's PDF on demand. Sets `pdfStoredPath` + flips status to
   * `pdf-rendered` if needed. Returns the absolute disk path so the
   * controller can stream it.
   */
  async renderPdf(id: string): Promise<{ row: MonthlyReport; absolutePath: string }> {
    const row = await this.getById(id);
    const project = await this.projects.findOne({
      where: { businessKey: row.projectBusinessKey, isCurrent: true },
    });
    const projectName = project?.name ?? row.projectBusinessKey;
    const metricsSummary = buildMetricsSummary(row.metrics);
    // Daily/weekly rows print their `periodKey`; monthly stays as `month`.
    const periodLabel = row.periodKey ?? row.month;
    const result = await this.pdf.render(row.id, {
      projectName,
      projectBusinessKey: row.projectBusinessKey,
      month: periodLabel,
      audience: row.audience,
      narrative: row.narrative,
      metricsSummary,
      citations: row.citations,
      personaSlug: row.personaSlug,
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
  ): Promise<{ narrative: string; citations: string[]; personaVersion: number; model: string } | null> {
    try {
      const userMessage = buildUserQuery(audience, projectName, cadence);
      // Cadence importance: monthly (most) > weekly > daily — drop the daily
      // call to the lighter tier even for owner/PD to keep cost sane on the
      // daily heartbeat, while monthly + weekly keep their audience tier.
      const tier = cadence === 'day' ? 'claude-sonnet' : TIER_BY_AUDIENCE[audience];
      const result = await this.claude.callPersona(REPORT_PERSONA_SLUG, userMessage, {
        context: facts,
        modelTier: tier,
      });
      return {
        narrative: result.content,
        citations: result.citations,
        personaVersion: result.personaVersion,
        model: result.model,
      };
    } catch (err) {
      this.logger.warn(`Claude call failed for ${cadence} report: ${(err as Error).message}`);
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
