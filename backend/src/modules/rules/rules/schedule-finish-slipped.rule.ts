import { Injectable } from '@nestjs/common';

import { daysBetween } from '../../../common/dates';
import { AlertSeverity } from '../../../common/enums';
import { AlertDraft, ProjectSnapshot, Rule, RuleConfig } from '../types';

/**
 * Flags any completed activity whose actual finish is later than its planned
 * finish. Each alert carries the actual day-delta and points back at the
 * specific Activity row (ingestion-run + source-file traceable).
 */
@Injectable()
export class ScheduleFinishSlippedRule implements Rule {
  readonly code = 'SCHEDULE_FINISH_SLIPPED';
  readonly defaultSeverity = AlertSeverity.CRITICAL;

  evaluate(snapshot: ProjectSnapshot, _config: RuleConfig): AlertDraft[] {
    const drafts: AlertDraft[] = [];
    for (const activity of snapshot.activities) {
      if (!activity.actualFinish || !activity.plannedFinish) continue;
      const slip = daysBetween(activity.plannedFinish, activity.actualFinish);
      if (slip === null || slip <= 0) continue;
      drafts.push({
        code: this.code,
        severity: this.defaultSeverity,
        summary: `Activity "${activity.name}" finished ${slip} day(s) late.`,
        context: {
          plannedFinish: activity.plannedFinish,
          actualFinish: activity.actualFinish,
          slipDays: slip,
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
