import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  Activity,
  Alert,
  ConfidenceScore,
  IngestionRun,
  Project,
  Report,
  Resource,
  ResourceAssignment,
  SourceFile,
} from '../canonical/entities';

export interface EvidencePackage {
  alert: Alert;
  rationale: string;
  project: Project | null;
  activity: Activity | null;
  resource: Resource | null;
  assignment: ResourceAssignment | null;
  report: Report | null;
  ingestionRun: IngestionRun | null;
  sourceFile: SourceFile | null;
  confidence: ConfidenceScore | null;
  rawSourceSnippets: Record<string, unknown>;
}

/**
 * Cycle 3 — Decision traceability. For a given Alert, assembles the full
 * evidence chain: the triggering canonical rows, their original parsed
 * payloads (`rawSource`), the IngestionRun + SourceFile they came from, and
 * the run's confidence score. The output answers, in one call, the governance
 * question: *"Why this alert, and what is the trust level of its data?"*
 */
@Injectable()
export class EvidenceService {
  constructor(
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(ResourceAssignment) private readonly assignments: Repository<ResourceAssignment>,
    @InjectRepository(Report) private readonly reports: Repository<Report>,
    @InjectRepository(IngestionRun) private readonly runs: Repository<IngestionRun>,
    @InjectRepository(SourceFile) private readonly sourceFiles: Repository<SourceFile>,
    @InjectRepository(ConfidenceScore) private readonly confidences: Repository<ConfidenceScore>,
  ) {}

  async forAlert(alertId: string): Promise<EvidencePackage> {
    const alert = await this.alerts.findOne({ where: { id: alertId } });
    if (!alert) throw new NotFoundException(`Alert ${alertId} not found`);

    const [project, activity, resource, assignment, report, run, sourceFile, confidence] = await Promise.all([
      this.projects.findOne({ where: { id: alert.projectId } }),
      alert.activityId ? this.activities.findOne({ where: { id: alert.activityId } }) : Promise.resolve(null),
      alert.resourceId ? this.resources.findOne({ where: { id: alert.resourceId } }) : Promise.resolve(null),
      alert.assignmentId ? this.assignments.findOne({ where: { id: alert.assignmentId } }) : Promise.resolve(null),
      alert.reportId ? this.reports.findOne({ where: { id: alert.reportId } }) : Promise.resolve(null),
      this.runs.findOne({ where: { id: alert.ingestionRunId } }),
      this.sourceFiles.findOne({ where: { id: alert.sourceFileId } }),
      this.confidences.findOne({ where: { ingestionRunId: alert.ingestionRunId } }),
    ]);

    const rawSourceSnippets: Record<string, unknown> = {};
    if (project) rawSourceSnippets.project = project.rawSource;
    if (activity) rawSourceSnippets.activity = activity.rawSource;
    if (resource) rawSourceSnippets.resource = resource.rawSource;
    if (assignment) rawSourceSnippets.assignment = assignment.rawSource;
    if (report) rawSourceSnippets.report = report.rawSource;

    return {
      alert,
      rationale: explain(alert),
      project,
      activity,
      resource,
      assignment,
      report,
      ingestionRun: run,
      sourceFile,
      confidence,
      rawSourceSnippets,
    };
  }
}

/** Human-readable rationale derived deterministically from rule code + context. */
function explain(alert: Alert): string {
  const ctx = alert.context ?? {};
  switch (alert.code) {
    case 'SCHEDULE_FINISH_SLIPPED':
      return `Actual finish (${ctx.actualFinish}) is later than planned finish (${ctx.plannedFinish}) by ${ctx.slipDays} day(s).`;
    case 'SCHEDULE_BEHIND_PLAN':
      return `Actual progress (${pct(ctx.actualPct)}) is more than ${pct(ctx.threshold)} below planned progress (${pct(ctx.plannedPct)}).`;
    case 'DURATION_OVERRUN':
      return `Actual duration ${ctx.actualDays} day(s) exceeds planned ${ctx.plannedDays} day(s) (ratio ${pct(ctx.ratio, false)}, threshold ${pct(ctx.threshold, false)}).`;
    case 'COST_OVERRUN':
      return `Actual cost (${ctx.actual}) exceeds budget (${ctx.budgeted}) by ratio ${pct(ctx.ratio, false)}, threshold ${pct(ctx.threshold, false)}.`;
    case 'RESOURCE_UNDERUSE':
      return `Resource usage (${ctx.actualUnits}/${ctx.plannedUnits} = ${pct(ctx.ratio)}) is below threshold ${pct(ctx.threshold)} on an in-progress activity.`;
    case 'STALE_REPORTING':
      return `Latest report is ${ctx.ageDays} day(s) old vs project data date — exceeds the ${ctx.threshold}-day reporting cadence.`;
    default:
      return alert.summary;
  }
}

function pct(value: unknown, asPercentSuffix = true): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return asPercentSuffix ? `${(n * 100).toFixed(1)}%` : `${(n * 100).toFixed(0)}%`;
}
