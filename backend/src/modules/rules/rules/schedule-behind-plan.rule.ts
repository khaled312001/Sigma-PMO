import { Injectable } from '@nestjs/common';

import { AlertSeverity } from '../../../common/enums';
import { AlertDraft, ProjectSnapshot, Rule, RuleConfig } from '../types';

/**
 * In-progress activities where actual progress is materially below planned
 * progress (gap > scheduleBehindThreshold).
 */
@Injectable()
export class ScheduleBehindPlanRule implements Rule {
  readonly code = 'SCHEDULE_BEHIND_PLAN';
  readonly defaultSeverity = AlertSeverity.WARNING;

  evaluate(snapshot: ProjectSnapshot, config: RuleConfig): AlertDraft[] {
    const drafts: AlertDraft[] = [];
    for (const activity of snapshot.activities) {
      if (activity.plannedPctComplete === null || activity.actualPctComplete === null) continue;
      // Skip not-started and completed activities — focus on in-progress slippage.
      if (activity.actualPctComplete <= 0 || activity.actualPctComplete >= 1) continue;
      const gap = activity.plannedPctComplete - activity.actualPctComplete;
      if (gap <= config.scheduleBehindThreshold) continue;

      drafts.push({
        code: this.code,
        severity: gap >= 0.2 ? AlertSeverity.CRITICAL : this.defaultSeverity,
        summary:
          `Activity "${activity.name}" is ${(gap * 100).toFixed(1)}% behind plan ` +
          `(planned ${(activity.plannedPctComplete * 100).toFixed(0)}%, ` +
          `actual ${(activity.actualPctComplete * 100).toFixed(0)}%).`,
        context: {
          plannedPct: activity.plannedPctComplete,
          actualPct: activity.actualPctComplete,
          gap,
          threshold: config.scheduleBehindThreshold,
        },
        projectId: snapshot.project.id,
        activityId: activity.id,
        ingestionRunId: activity.ingestionRunId,
        sourceFileId: activity.sourceFileId,
      });
    }
    return drafts;
  }
}
