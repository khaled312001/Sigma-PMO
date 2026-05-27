import { Injectable } from '@nestjs/common';

import { AlertSeverity } from '../../../common/enums';
import { AlertDraft, ProjectSnapshot, Rule, RuleConfig } from '../types';

/** Triggers when an activity's actual cost exceeds its budget by the threshold. */
@Injectable()
export class CostOverrunRule implements Rule {
  readonly code = 'COST_OVERRUN';
  readonly defaultSeverity = AlertSeverity.CRITICAL;

  evaluate(snapshot: ProjectSnapshot, config: RuleConfig): AlertDraft[] {
    const drafts: AlertDraft[] = [];
    for (const activity of snapshot.activities) {
      const budgeted = numeric(activity.budgetedCost);
      const actual = numeric(activity.actualCost);
      if (budgeted === null || budgeted <= 0 || actual === null) continue;
      const ratio = actual / budgeted;
      if (ratio <= config.costOverrunThreshold) continue;

      drafts.push({
        code: this.code,
        severity: ratio >= 1.5 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
        summary:
          `Activity "${activity.name}" cost ${actual.toFixed(0)} vs budget ${budgeted.toFixed(0)} ` +
          `(${(ratio * 100).toFixed(0)}%).`,
        context: { budgeted, actual, ratio, threshold: config.costOverrunThreshold },
        projectId: snapshot.project.id,
        activityId: activity.id,
        ingestionRunId: activity.ingestionRunId,
        sourceFileId: activity.sourceFileId,
      });
    }
    return drafts;
  }
}

function numeric(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
