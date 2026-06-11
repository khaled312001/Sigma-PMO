import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RuleEvaluationStatus } from '../../common/enums';
import { Alert, RuleEvaluation } from '../canonical/entities';
import { BaselineDurationOutlierRule } from './rules/baseline-duration-outlier.rule';
import { CostOverrunRule } from './rules/cost-overrun.rule';
import { DataCompletenessRule } from './rules/data-completeness.rule';
import { DurationOverrunRule } from './rules/duration-overrun.rule';
import { MissingWeeklyReportRule } from './rules/missing-weekly-report.rule';
import { ReportedVsScheduleMismatchRule } from './rules/reported-vs-schedule-mismatch.rule';
import { ResourceUnderuseRule } from './rules/resource-underuse.rule';
import { ScheduleBehindPlanRule } from './rules/schedule-behind-plan.rule';
import { ScheduleFinishSlippedRule } from './rules/schedule-finish-slipped.rule';
import { StaleReportingRule } from './rules/stale-reporting.rule';
import { SnapshotService } from './snapshot.service';
import { AlertDraft, DEFAULT_RULE_CONFIG, ProjectSnapshot, Rule, RuleConfig } from './types';

export interface RuleEvaluationOutcome {
  evaluationId: string;
  alertCount: number;
  byCode: Record<string, number>;
  bySeverity: Record<string, number>;
}

/**
 * Orchestrates rule execution against the current canonical snapshot. Each
 * evaluation creates a RuleEvaluation row and persists all produced Alerts —
 * every Alert is row-pinned and source-traceable (see Alert entity).
 */
@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);
  private readonly rules: Rule[];

  constructor(
    private readonly snapshots: SnapshotService,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(RuleEvaluation) private readonly evaluations: Repository<RuleEvaluation>,
    finishSlipped: ScheduleFinishSlippedRule,
    behindPlan: ScheduleBehindPlanRule,
    durationOverrun: DurationOverrunRule,
    costOverrun: CostOverrunRule,
    resourceUnderuse: ResourceUnderuseRule,
    staleReporting: StaleReportingRule,
    baselineDurationOutlier: BaselineDurationOutlierRule,
    reportedVsSchedule: ReportedVsScheduleMismatchRule,
    missingWeekly: MissingWeeklyReportRule,
    dataCompleteness: DataCompletenessRule,
  ) {
    this.rules = [
      finishSlipped,
      behindPlan,
      durationOverrun,
      costOverrun,
      resourceUnderuse,
      staleReporting,
      baselineDurationOutlier,
      reportedVsSchedule,
      missingWeekly,
      dataCompleteness,
    ];
  }

  registeredRules(): { code: string; defaultSeverity: string }[] {
    return this.rules.map((r) => ({ code: r.code, defaultSeverity: r.defaultSeverity }));
  }

  /** Evaluate one specific project. */
  async evaluateProject(projectId: string, config?: Partial<RuleConfig>): Promise<RuleEvaluationOutcome> {
    const snapshot = await this.snapshots.load(projectId);
    return this.runFor([snapshot], projectId, config);
  }

  /** Evaluate every project whose latest version is current. */
  async evaluateAll(config?: Partial<RuleConfig>): Promise<RuleEvaluationOutcome> {
    const snapshots = await this.snapshots.loadAllCurrent();
    return this.runFor(snapshots, null, config);
  }

  private async runFor(
    snapshots: ProjectSnapshot[],
    projectId: string | null,
    overrides?: Partial<RuleConfig>,
  ): Promise<RuleEvaluationOutcome> {
    const config: RuleConfig = { ...DEFAULT_RULE_CONFIG, ...(overrides ?? {}) };
    const evaluation = await this.evaluations.save(
      this.evaluations.create({
        projectId,
        status: RuleEvaluationStatus.RUNNING,
        startedAt: new Date(),
        finishedAt: null,
        alertCount: 0,
        summary: { ruleCount: this.rules.length, projectCount: snapshots.length },
      }),
    );

    const drafts: AlertDraft[] = [];
    const byCode: Record<string, number> = {};

    try {
      for (const snapshot of snapshots) {
        for (const rule of this.rules) {
          const produced = rule.evaluate(snapshot, config);
          for (const draft of produced) {
            drafts.push(draft);
            byCode[draft.code] = (byCode[draft.code] ?? 0) + 1;
          }
        }
      }

      const bySeverity: Record<string, number> = {};
      const rows = drafts.map((d) => {
        bySeverity[d.severity] = (bySeverity[d.severity] ?? 0) + 1;
        return this.alerts.create({
          ...d,
          activityId: d.activityId ?? null,
          resourceId: d.resourceId ?? null,
          assignmentId: d.assignmentId ?? null,
          reportId: d.reportId ?? null,
          ruleEvaluationId: evaluation.id,
        });
      });

      if (rows.length > 0) await this.alerts.save(rows);

      evaluation.status = RuleEvaluationStatus.COMPLETED;
      evaluation.finishedAt = new Date();
      evaluation.alertCount = drafts.length;
      evaluation.summary = { ...evaluation.summary, byCode, bySeverity, config };
      await this.evaluations.save(evaluation);

      this.logger.log(
        `Rule evaluation ${evaluation.id} completed: ${drafts.length} alerts ` +
          `across ${snapshots.length} project(s).`,
      );

      return { evaluationId: evaluation.id, alertCount: drafts.length, byCode, bySeverity };
    } catch (error) {
      evaluation.status = RuleEvaluationStatus.FAILED;
      evaluation.finishedAt = new Date();
      evaluation.summary = { ...evaluation.summary, error: (error as Error).message };
      await this.evaluations.save(evaluation);
      throw error;
    }
  }
}
