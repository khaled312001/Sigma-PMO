import { Injectable } from '@nestjs/common';

import { AlertSeverity } from '../../../common/enums';
import { Activity } from '../../canonical/entities';
import { AlertDraft, ProjectSnapshot, Rule, RuleConfig } from '../types';

/**
 * Threshold the contractor's planned duration must exceed (or fall below) the
 * median of its activity-type peer group to be flagged. Symmetric: a 100%
 * padding above the median and a 50% optimism below it are equally suspect.
 *
 * Conservative defaults — chosen so a 10-day median activity must be ≥ 20
 * days to be flagged as padded, or ≤ 5 days to be flagged as optimistic.
 */
const PADDING_MULTIPLIER = 2.0;
const OPTIMISM_MULTIPLIER = 0.5;

/** Min activities per type before we trust the median. Below this we skip the group. */
const MIN_GROUP_SIZE = 5;

/** Activities shorter than this are too small to be peer-statistical. */
const MIN_DURATION_DAYS = 1;

/**
 * Baseline schedule audit — the "25-year planner catches contractor tricks"
 * rule from Al Ayham's 2026-06-08 meeting (≈17:50–18:35 in the transcript).
 *
 * The contractor submits a baseline that *looks* reasonable to anyone who
 * doesn't have time to compare every activity against its peers. A senior
 * planner will spot two patterns instantly:
 *
 *  - **PADDING**: a single activity wildly over-estimated (e.g. 60 days for
 *    a "MEP rough-in" when the median for that type is 15 days). Buys the
 *    contractor a hidden buffer they can quietly burn without showing slip.
 *  - **OPTIMISM**: a single activity wildly under-estimated. Shows up as
 *    on-time on the baseline summary, then explodes during execution as a
 *    surprise critical-path hit.
 *
 * This rule reproduces that pattern statistically:
 *  1. Group activities by `activityType` (Primavera-aligned categorisation).
 *  2. For each group with ≥ MIN_GROUP_SIZE entries, compute the median
 *     `plannedDurationDays`.
 *  3. Flag any activity whose duration exceeds `median × PADDING_MULTIPLIER`
 *     as a WARNING (padding) and any whose duration is below
 *     `median × OPTIMISM_MULTIPLIER` as INFO (optimism — lower severity
 *     because it might be a deliberately small placeholder).
 *
 * The rule is read-only on the snapshot: every alert carries the same source
 * traceability fields (ingestionRun + sourceFile) as the existing 6 rules so
 * the evidence chain (ADR-0005) extends naturally.
 *
 * Note: this rule fires on the *baseline* — activities with `actualStart`
 * already set are excluded, because once execution has started the planner's
 * complaint shifts from "this estimate is wrong" to "this estimate was
 * wrong" (the latter is covered by `DurationOverrunRule`).
 */
@Injectable()
export class BaselineDurationOutlierRule implements Rule {
  readonly code = 'BASELINE_DURATION_OUTLIER';
  readonly defaultSeverity = AlertSeverity.WARNING;

  evaluate(snapshot: ProjectSnapshot, _config: RuleConfig): AlertDraft[] {
    const drafts: AlertDraft[] = [];

    const eligible = snapshot.activities.filter(
      (a) =>
        !a.actualStart &&
        a.activityType !== null &&
        a.plannedDurationDays !== null &&
        a.plannedDurationDays >= MIN_DURATION_DAYS,
    );

    const byType = new Map<string, Activity[]>();
    for (const a of eligible) {
      const key = a.activityType ?? 'unknown';
      const bucket = byType.get(key) ?? [];
      bucket.push(a);
      byType.set(key, bucket);
    }

    for (const [type, group] of byType.entries()) {
      if (group.length < MIN_GROUP_SIZE) continue;
      const median = medianOf(
        group
          .map((a) => a.plannedDurationDays)
          .filter((d): d is number => d !== null),
      );
      if (median <= 0) continue;

      const paddedThreshold = median * PADDING_MULTIPLIER;
      const optimisticThreshold = median * OPTIMISM_MULTIPLIER;

      for (const a of group) {
        const d = a.plannedDurationDays;
        if (d === null) continue;

        if (d > paddedThreshold) {
          drafts.push(this.draft(snapshot, a, type, median, d, 'padded'));
        } else if (d < optimisticThreshold) {
          drafts.push(this.draft(snapshot, a, type, median, d, 'optimistic'));
        }
      }
    }

    return drafts;
  }

  private draft(
    snapshot: ProjectSnapshot,
    activity: Activity,
    activityType: string,
    medianDays: number,
    actualDays: number,
    kind: 'padded' | 'optimistic',
  ): AlertDraft {
    const ratio = actualDays / medianDays;
    const severity = kind === 'padded' ? AlertSeverity.WARNING : AlertSeverity.INFO;
    const direction = kind === 'padded' ? 'above' : 'below';
    const factor = kind === 'padded' ? ratio.toFixed(1) : (1 / ratio).toFixed(1);
    return {
      code: this.code,
      severity,
      summary:
        `Activity "${activity.name}" has a planned duration of ${actualDays} day(s), ` +
        `${factor}× ${direction} the median ${medianDays.toFixed(1)} day(s) ` +
        `for activity type "${activityType}" (${kind}).`,
      context: {
        activityType,
        actualDurationDays: actualDays,
        medianDurationDays: medianDays,
        ratio,
        kind,
      },
      projectId: snapshot.project.id,
      activityId: activity.id,
      ingestionRunId: activity.ingestionRunId,
      sourceFileId: activity.sourceFileId,
    };
  }
}

/** Median of a non-empty number array. Returns 0 for an empty input. */
function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
