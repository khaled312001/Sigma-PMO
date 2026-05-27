import { Injectable } from '@nestjs/common';

import { daysBetween } from '../../../common/dates';
import { AlertSeverity } from '../../../common/enums';
import { AlertDraft, ProjectSnapshot, Rule, RuleConfig } from '../types';

/**
 * For completed activities only: actual elapsed duration vs planned duration.
 * Triggers when the ratio exceeds `durationOverrunThreshold`.
 */
@Injectable()
export class DurationOverrunRule implements Rule {
  readonly code = 'DURATION_OVERRUN';
  readonly defaultSeverity = AlertSeverity.WARNING;

  evaluate(snapshot: ProjectSnapshot, config: RuleConfig): AlertDraft[] {
    const drafts: AlertDraft[] = [];
    for (const activity of snapshot.activities) {
      if (!activity.actualStart || !activity.actualFinish) continue;
      if (activity.plannedDurationDays === null || activity.plannedDurationDays <= 0) continue;
      const actualDays = daysBetween(activity.actualStart, activity.actualFinish);
      if (actualDays === null || actualDays <= 0) continue;
      const ratio = actualDays / activity.plannedDurationDays;
      if (ratio <= config.durationOverrunThreshold) continue;

      drafts.push({
        code: this.code,
        severity: ratio >= 1.5 ? AlertSeverity.CRITICAL : this.defaultSeverity,
        summary:
          `Activity "${activity.name}" took ${actualDays} day(s) vs ` +
          `${activity.plannedDurationDays} planned (${(ratio * 100).toFixed(0)}%).`,
        context: {
          plannedDays: activity.plannedDurationDays,
          actualDays,
          ratio,
          threshold: config.durationOverrunThreshold,
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
