import { Injectable } from '@nestjs/common';

import { AlertSeverity } from '../../../common/enums';
import { AlertDraft, ProjectSnapshot, Rule, RuleConfig } from '../types';

/**
 * For in-progress activities, flags resource assignments whose actual usage is
 * materially below planned (labour drop / equipment idle), which often
 * precedes a schedule slip.
 */
@Injectable()
export class ResourceUnderuseRule implements Rule {
  readonly code = 'RESOURCE_UNDERUSE';
  readonly defaultSeverity = AlertSeverity.WARNING;

  evaluate(snapshot: ProjectSnapshot, config: RuleConfig): AlertDraft[] {
    const drafts: AlertDraft[] = [];
    const activityById = new Map(snapshot.activities.map((a) => [a.id, a]));

    for (const assignment of snapshot.assignments) {
      const planned = assignment.plannedUnits;
      const actual = assignment.actualUnits;
      if (planned === null || planned <= 0 || actual === null) continue;
      const ratio = actual / planned;
      if (ratio >= config.resourceUnderuseThreshold) continue;

      const activity = activityById.get(assignment.activityId);
      // Only flag for in-progress activities (avoid noise on not-started ones).
      if (!activity || activity.actualPctComplete === null) continue;
      if (activity.actualPctComplete <= 0 || activity.actualPctComplete >= 1) continue;

      drafts.push({
        code: this.code,
        severity: this.defaultSeverity,
        summary:
          `Resource on "${activity.name}" used ${actual.toFixed(0)} of ${planned.toFixed(0)} ` +
          `planned units (${(ratio * 100).toFixed(0)}%).`,
        context: { plannedUnits: planned, actualUnits: actual, ratio, threshold: config.resourceUnderuseThreshold },
        projectId: snapshot.project.id,
        activityId: activity.id,
        assignmentId: assignment.id,
        resourceId: assignment.resourceId,
        ingestionRunId: assignment.ingestionRunId,
        sourceFileId: assignment.sourceFileId,
      });
    }
    return drafts;
  }
}
