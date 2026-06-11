import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { daysBetween } from '../../common/dates';
import {
  Alert,
  ConfidenceScore,
  ExecutiveSummary,
  Project,
} from '../canonical/entities';
import { SnapshotService } from '../rules/snapshot.service';
import { ProjectSnapshot } from '../rules/types';
import { LlmService } from './llm.service';

export interface SummaryGenerationOptions {
  projectKey?: string;
  projectId?: string;
  /** Reporting window end; defaults to today (UTC). */
  periodEnd?: string;
  /** Window length in days from periodEnd backwards; default 7. */
  periodDays?: number;
  /** Narrative locale — `ar` emits §8 construction-Arabic terms. Default `en`. */
  locale?: 'en' | 'ar';
}

/**
 * Generates a Weekly Executive Summary for a project. The pipeline always
 * produces a deterministic grounded narrative from the canonical snapshot +
 * latest alerts + recent reports. If an LLM is configured, the grounded text
 * is rewritten into executive prose — facts and numbers come only from the
 * grounded version (no hallucination surface).
 */
@Injectable()
export class SummaryService {
  constructor(
    private readonly snapshots: SnapshotService,
    private readonly llm: LlmService,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(ConfidenceScore) private readonly confidences: Repository<ConfidenceScore>,
    @InjectRepository(ExecutiveSummary) private readonly summaries: Repository<ExecutiveSummary>,
  ) {}

  async generate(options: SummaryGenerationOptions): Promise<ExecutiveSummary> {
    const project = await this.resolveProject(options);
    const snapshot = await this.snapshots.load(project.id);

    const periodEnd = options.periodEnd ?? toDateOnlyUtc(new Date());
    const periodDays = Math.max(1, Math.min(90, options.periodDays ?? 7));
    const periodStart = subtractDaysIso(periodEnd, periodDays - 1);

    const alertsForProject = await this.alerts.find({
      where: { projectId: project.id },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    const confidenceAverage = await this.averageConfidenceFor(snapshot);
    const grounded = composeGrounded(
      snapshot,
      alertsForProject,
      periodStart,
      periodEnd,
      confidenceAverage,
      options.locale ?? 'en',
    );

    let narrative = grounded;
    let source = 'deterministic';
    let llmProvider: string | null = null;
    let llmModel: string | null = null;

    const rewritten = await this.llm.rewrite(grounded, project.name);
    if (rewritten) {
      narrative = rewritten.text;
      source = 'llm';
      llmProvider = rewritten.provider;
      llmModel = rewritten.model;
    }

    const latestEvaluationId = alertsForProject[0]?.ruleEvaluationId ?? null;

    const summary = this.summaries.create({
      projectId: project.id,
      periodStart,
      periodEnd,
      groundedNarrative: grounded,
      narrative,
      source,
      llmProvider,
      llmModel,
      ruleEvaluationId: latestEvaluationId,
      confidenceAverage,
      metrics: buildMetrics(snapshot, alertsForProject, confidenceAverage),
    });
    return this.summaries.save(summary);
  }

  list(projectId?: string, limit = 20, projectKey?: string): Promise<ExecutiveSummary[]> {
    const take = Math.min(Math.max(limit, 1), 100);
    if (projectKey) {
      // Summaries pin to a VERSIONED project id; scope by the stable
      // businessKey across all versions (never group by project.id — versioned
      // rows would undercount after each re-ingestion rolls the project).
      return this.summaries
        .createQueryBuilder('s')
        .innerJoin(Project, 'p', 'p.id = s.projectId')
        .where('p.businessKey = :projectKey', { projectKey })
        .orderBy('s.createdAt', 'DESC')
        .take(take)
        .getMany();
    }
    return this.summaries.find({
      where: projectId ? { projectId } : {},
      order: { createdAt: 'DESC' },
      take,
    });
  }

  private async resolveProject(options: SummaryGenerationOptions): Promise<Project> {
    if (options.projectId) {
      const p = await this.projects.findOne({ where: { id: options.projectId } });
      if (!p) throw new NotFoundException(`Project ${options.projectId} not found`);
      return p;
    }
    if (options.projectKey) {
      const p = await this.projects.findOne({ where: { businessKey: options.projectKey, isCurrent: true } });
      if (!p) throw new NotFoundException(`No current project with key "${options.projectKey}"`);
      return p;
    }
    throw new NotFoundException('Either projectId or projectKey must be supplied');
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
    const total = scores.reduce((acc, s) => acc + s.overall, 0);
    return total / scores.length;
  }
}

// -- Deterministic narrative composition (the source of truth) -----------------

/**
 * Per-locale narrative vocabulary (plan §8 — «اللغة المستخدمة في المجال
 * نفسه»). The Arabic column uses the construction-industry terms from the
 * §8 table — «الجدول الزمني» (never the dictionary-literal «الجدول»),
 * «النتائج الحرجة», «موثوقية البيانات» — not machine translations. The
 * SECTION HEADERS double as the parsing protocol with the frontend
 * `SummaryView`; its matchers accept both columns so legacy English rows
 * keep rendering.
 */
const NARRATIVE_TERMS = {
  en: {
    project: 'Project',
    reportingPeriod: 'Reporting period',
    dataDate: 'Schedule data date',
    plannedDuration: 'Planned duration',
    days: 'days',
    scheduleStatus: 'Schedule status',
    activities: (n: number, c: number, p: number, ns: number) =>
      `Activities: ${n} (completed ${c}, in progress ${p}, not started ${ns}).`,
    progress: (plan: string, act: string, delta: string) =>
      `Avg planned progress: ${plan}% vs actual ${act}% (delta ${delta}pp).`,
    alerts: 'Alerts',
    alertTotals: (t: number, c: number, w: number) =>
      `Total ${t}; critical ${c}; warning ${w}.`,
    criticalFindings: 'Critical findings',
    reporting: 'Reporting',
    reportsInWindow: (n: number) => `Reports in window: ${n}.`,
    latestReport: (date: string, by: string, narrative: string) =>
      `Latest report ${date} by ${by}: ${narrative}`,
    unknown: 'unknown',
    noNarrative: '(no narrative)',
    confidence: (pct: string) =>
      `Data confidence (avg across this project's data): ${pct}%.`,
  },
  ar: {
    project: 'المشروع',
    reportingPeriod: 'فترة التقرير',
    dataDate: 'تاريخ بيانات الجدول الزمني',
    plannedDuration: 'المدة المخططة',
    days: 'يوماً',
    scheduleStatus: 'حالة الجدول الزمني',
    activities: (n: number, c: number, p: number, ns: number) =>
      `الأنشطة: ${n} (مكتملة ${c}، قيد التنفيذ ${p}، لم تبدأ ${ns}).`,
    progress: (plan: string, act: string, delta: string) =>
      `متوسط الإنجاز المخطط: ${plan}% مقابل الفعلي ${act}% (الفرق ${delta}pp).`,
    alerts: 'التنبيهات',
    alertTotals: (t: number, c: number, w: number) =>
      `الإجمالي ${t}؛ حرجة ${c}؛ تحذيرية ${w}.`,
    criticalFindings: 'النتائج الحرجة',
    reporting: 'التقارير',
    reportsInWindow: (n: number) => `التقارير ضمن الفترة: ${n}.`,
    latestReport: (date: string, by: string, narrative: string) =>
      `أحدث تقرير ${date} بواسطة ${by}: ${narrative}`,
    unknown: 'غير معروف',
    noNarrative: '(بدون سرد)',
    confidence: (pct: string) =>
      `موثوقية البيانات (متوسط بيانات هذا المشروع): ${pct}%.`,
  },
} as const;

function composeGrounded(
  snapshot: ProjectSnapshot,
  alerts: Alert[],
  periodStart: string,
  periodEnd: string,
  confidence: number,
  locale: 'en' | 'ar' = 'en',
): string {
  const T = NARRATIVE_TERMS[locale];
  const { project, activities, reports } = snapshot;
  const completed = activities.filter((a) => a.actualPctComplete !== null && a.actualPctComplete >= 1).length;
  const inProgress = activities.filter((a) => (a.actualPctComplete ?? 0) > 0 && (a.actualPctComplete ?? 0) < 1).length;
  const notStarted = activities.filter((a) => (a.actualPctComplete ?? 0) <= 0).length;

  const overallPlannedAvg = avg(activities.map((a) => a.plannedPctComplete).filter((n): n is number => n !== null));
  const overallActualAvg = avg(activities.map((a) => a.actualPctComplete).filter((n): n is number => n !== null));

  const criticalAlerts = alerts.filter((a) => a.severity === 'critical');
  const warningAlerts = alerts.filter((a) => a.severity === 'warning');
  const byCode: Record<string, number> = {};
  for (const a of alerts) byCode[a.code] = (byCode[a.code] ?? 0) + 1;

  const periodReports = reports.filter((r) => r.reportDate >= periodStart && r.reportDate <= periodEnd);
  const latestReport = [...reports].sort((a, b) => (a.reportDate < b.reportDate ? 1 : -1))[0] ?? null;

  const lines: string[] = [];
  lines.push(`${T.project}: ${project.name}`);
  lines.push(`${T.reportingPeriod}: ${periodStart} → ${periodEnd}.`);
  if (project.dataDate) lines.push(`${T.dataDate}: ${project.dataDate}.`);
  if (project.plannedStart && project.plannedFinish) {
    const total = daysBetween(project.plannedStart, project.plannedFinish);
    lines.push(`${T.plannedDuration}: ${project.plannedStart} → ${project.plannedFinish}${total ? ` (${total} ${T.days})` : ''}.`);
  }
  lines.push('');
  lines.push(`${T.scheduleStatus}:`);
  lines.push(`  - ${T.activities(activities.length, completed, inProgress, notStarted)}`);
  if (overallPlannedAvg !== null && overallActualAvg !== null) {
    lines.push(`  - ${T.progress((overallPlannedAvg * 100).toFixed(1), (overallActualAvg * 100).toFixed(1), ((overallActualAvg - overallPlannedAvg) * 100).toFixed(1))}`);
  }
  lines.push('');
  lines.push(`${T.alerts}:`);
  lines.push(`  - ${T.alertTotals(alerts.length, criticalAlerts.length, warningAlerts.length)}`);
  for (const [code, n] of Object.entries(byCode)) lines.push(`  - ${code}: ${n}`);
  if (criticalAlerts.length > 0) {
    lines.push('');
    lines.push(`${T.criticalFindings}:`);
    for (const a of criticalAlerts.slice(0, 5)) lines.push(`  - [${a.code}] ${a.summary}`);
  }
  lines.push('');
  lines.push(`${T.reporting}:`);
  lines.push(`  - ${T.reportsInWindow(periodReports.length)}`);
  if (latestReport) lines.push(`  - ${T.latestReport(latestReport.reportDate, latestReport.submittedBy ?? T.unknown, latestReport.narrative ?? T.noNarrative)}`);
  lines.push('');
  lines.push(T.confidence((confidence * 100).toFixed(1)));
  return lines.join('\n');
}

function buildMetrics(snapshot: ProjectSnapshot, alerts: Alert[], confidence: number): Record<string, unknown> {
  const byCode: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const a of alerts) {
    byCode[a.code] = (byCode[a.code] ?? 0) + 1;
    bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
  }
  return {
    activityCount: snapshot.activities.length,
    reportCount: snapshot.reports.length,
    alertCount: alerts.length,
    alertsByCode: byCode,
    alertsBySeverity: bySeverity,
    confidenceAverage: confidence,
  };
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function toDateOnlyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function subtractDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
