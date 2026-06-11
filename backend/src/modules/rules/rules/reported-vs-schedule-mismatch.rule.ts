import { Injectable } from '@nestjs/common';

import { ReportType } from '../../../common/enums';
import { AlertSeverity } from '../../../common/enums';
import { AlertDraft, ProjectSnapshot, Rule, RuleConfig } from '../types';

/**
 * Threshold (in percentage POINTS) between what the latest weekly Report claims
 * as overall progress and the schedule-weighted actual computed from the
 * activity rows. A gap wider than this is a cross-source consistency failure:
 * the narrative report and the underlying P6 schedule disagree about reality.
 */
const MISMATCH_POINTS_THRESHOLD = 15;

/**
 * Cross-source consistency rule (L2). Compares the headline progress the
 * contractor SELF-REPORTED in the most recent **weekly** Report
 * (`reportedPctComplete`) against the schedule-weighted actual progress derived
 * deterministically from the activity rows (`actualPctComplete` weighted by
 * `plannedDurationDays`, falling back to a flat mean when no weights exist).
 *
 * When the two differ by more than {@link MISMATCH_POINTS_THRESHOLD} percentage
 * points the rule fires a WARNING — the classic "the weekly says 80% but the
 * schedule says 62%" disconnect a senior planner catches by eye. Each alert
 * pins back to the offending Report row so the evidence chain (ADR-0005)
 * resolves to the exact source file the figure came from.
 *
 * Deterministic-first: every number here is computed in code with a named
 * basis (the duration-weighted mean). No LLM involvement.
 */
@Injectable()
export class ReportedVsScheduleMismatchRule implements Rule {
  readonly code = 'REPORTED_VS_SCHEDULE_MISMATCH';
  readonly defaultSeverity = AlertSeverity.WARNING;

  evaluate(snapshot: ProjectSnapshot, _config: RuleConfig): AlertDraft[] {
    const { project, activities, reports } = snapshot;

    // Latest WEEKLY report with a usable self-reported percentage.
    const weekly = [...reports]
      .filter((r) => r.reportType === ReportType.WEEKLY && r.reportedPctComplete !== null)
      .sort((a, b) => (a.reportDate < b.reportDate ? 1 : -1))[0];
    if (!weekly || weekly.reportedPctComplete === null) return [];

    const scheduleActual = scheduleWeightedActual(activities);
    if (scheduleActual === null) return [];

    const reportedPct = weekly.reportedPctComplete * 100;
    const schedulePct = scheduleActual * 100;
    const gapPoints = Math.abs(reportedPct - schedulePct);
    if (gapPoints <= MISMATCH_POINTS_THRESHOLD) return [];

    const direction = reportedPct > schedulePct ? 'over-reports' : 'under-reports';

    return [
      {
        code: this.code,
        severity: this.defaultSeverity,
        summary:
          `Latest weekly report for "${project.name}" ${direction} progress: ` +
          `reported ${reportedPct.toFixed(1)}% vs schedule-weighted actual ${schedulePct.toFixed(1)}% ` +
          `(gap ${gapPoints.toFixed(1)} pts, threshold ${MISMATCH_POINTS_THRESHOLD} pts).`,
        context: {
          reportedPct: weekly.reportedPctComplete,
          scheduleActualPct: scheduleActual,
          gapPoints,
          threshold: MISMATCH_POINTS_THRESHOLD,
          reportDate: weekly.reportDate,
          basis: 'duration-weighted',
        },
        projectId: project.id,
        reportId: weekly.id,
        ingestionRunId: weekly.ingestionRunId,
        sourceFileId: weekly.sourceFileId,
      },
    ];
  }
}

/**
 * Schedule-weighted actual progress in [0,1]. Weights each activity's
 * `actualPctComplete` by its `plannedDurationDays` so a 60-day task moves the
 * needle more than a 2-day task. Falls back to a flat mean when no activity
 * carries a positive planned duration. Returns null when no activity has an
 * actual percentage at all.
 */
function scheduleWeightedActual(
  activities: ProjectSnapshot['activities'],
): number | null {
  const withActual = activities.filter((a) => a.actualPctComplete !== null);
  if (withActual.length === 0) return null;

  let weightSum = 0;
  let weighted = 0;
  for (const a of withActual) {
    const w = a.plannedDurationDays ?? 0;
    if (w > 0) {
      weightSum += w;
      weighted += w * (a.actualPctComplete as number);
    }
  }
  if (weightSum > 0) return weighted / weightSum;

  // No usable weights — flat mean of the available actuals.
  const sum = withActual.reduce((acc, a) => acc + (a.actualPctComplete as number), 0);
  return sum / withActual.length;
}
