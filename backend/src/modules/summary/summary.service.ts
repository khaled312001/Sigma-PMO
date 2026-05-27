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
    const grounded = composeGrounded(snapshot, alertsForProject, periodStart, periodEnd, confidenceAverage);

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

  list(projectId?: string, limit = 20): Promise<ExecutiveSummary[]> {
    const take = Math.min(Math.max(limit, 1), 100);
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

function composeGrounded(
  snapshot: ProjectSnapshot,
  alerts: Alert[],
  periodStart: string,
  periodEnd: string,
  confidence: number,
): string {
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
  lines.push(`Project: ${project.name}`);
  lines.push(`Reporting period: ${periodStart} → ${periodEnd}.`);
  if (project.dataDate) lines.push(`Schedule data date: ${project.dataDate}.`);
  if (project.plannedStart && project.plannedFinish) {
    const total = daysBetween(project.plannedStart, project.plannedFinish);
    lines.push(`Planned duration: ${project.plannedStart} → ${project.plannedFinish}${total ? ` (${total} days)` : ''}.`);
  }
  lines.push('');
  lines.push('Schedule status:');
  lines.push(`  - Activities: ${activities.length} (completed ${completed}, in progress ${inProgress}, not started ${notStarted}).`);
  if (overallPlannedAvg !== null && overallActualAvg !== null) {
    lines.push(`  - Avg planned progress: ${(overallPlannedAvg * 100).toFixed(1)}% vs actual ${(overallActualAvg * 100).toFixed(1)}% (delta ${((overallActualAvg - overallPlannedAvg) * 100).toFixed(1)}pp).`);
  }
  lines.push('');
  lines.push('Alerts:');
  lines.push(`  - Total ${alerts.length}; critical ${criticalAlerts.length}; warning ${warningAlerts.length}.`);
  for (const [code, n] of Object.entries(byCode)) lines.push(`  - ${code}: ${n}`);
  if (criticalAlerts.length > 0) {
    lines.push('');
    lines.push('Critical findings:');
    for (const a of criticalAlerts.slice(0, 5)) lines.push(`  - [${a.code}] ${a.summary}`);
  }
  lines.push('');
  lines.push('Reporting:');
  lines.push(`  - Reports in window: ${periodReports.length}.`);
  if (latestReport) lines.push(`  - Latest report ${latestReport.reportDate} by ${latestReport.submittedBy ?? 'unknown'}: ${latestReport.narrative ?? '(no narrative)'}`);
  lines.push('');
  lines.push(`Data confidence (avg across this project's data): ${(confidence * 100).toFixed(1)}%.`);
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
