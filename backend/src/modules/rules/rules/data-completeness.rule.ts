import { Injectable } from '@nestjs/common';

import { AlertSeverity } from '../../../common/enums';
import { AlertDraft, ProjectSnapshot, Rule, RuleConfig } from '../types';

/**
 * Fraction of current activities allowed to be missing a required governance
 * field before the dataset is flagged as low-completeness. At or above this
 * share, downstream rules (cost overrun, schedule mismatch) lose statistical
 * footing — the governance answer is "fix the data before trusting the
 * analysis", which is exactly what this rule surfaces.
 */
const INCOMPLETE_FRACTION_THRESHOLD = 0.2;

/**
 * Governance validation rule (L2). Counts current activities missing either
 * `actualPctComplete` OR `budgetedCost` — the two fields every downstream
 * deterministic rule depends on. When ≥ {@link INCOMPLETE_FRACTION_THRESHOLD}
 * (20%) of activities are missing one of them, the rule fires a WARNING so the
 * governance layer knows the snapshot is partially blind.
 *
 * This is the data-quality gate Al Ayham asked for: the platform must say "I
 * cannot fully trust this analysis because 1 in 3 activities has no cost"
 * rather than silently computing on holes.
 *
 * Deterministic-first: a pure count over the snapshot. No LLM.
 */
@Injectable()
export class DataCompletenessRule implements Rule {
  readonly code = 'DATA_COMPLETENESS';
  readonly defaultSeverity = AlertSeverity.WARNING;

  evaluate(snapshot: ProjectSnapshot, _config: RuleConfig): AlertDraft[] {
    const { project, activities } = snapshot;
    const total = activities.length;
    if (total === 0) return [];

    const missingPct = activities.filter((a) => a.actualPctComplete === null).length;
    const missingCost = activities.filter((a) => a.budgetedCost === null).length;
    // An activity is "incomplete" if it is missing EITHER required field.
    const incomplete = activities.filter(
      (a) => a.actualPctComplete === null || a.budgetedCost === null,
    ).length;

    const fraction = incomplete / total;
    if (fraction < INCOMPLETE_FRACTION_THRESHOLD) return [];

    return [
      {
        code: this.code,
        severity: this.defaultSeverity,
        summary:
          `Data completeness for "${project.name}" is low: ${incomplete} of ${total} ` +
          `current activities (${(fraction * 100).toFixed(0)}%) are missing actual progress or budget ` +
          `(threshold ${(INCOMPLETE_FRACTION_THRESHOLD * 100).toFixed(0)}%).`,
        context: {
          totalActivities: total,
          incompleteActivities: incomplete,
          missingActualPct: missingPct,
          missingBudgetedCost: missingCost,
          incompleteFraction: fraction,
          threshold: INCOMPLETE_FRACTION_THRESHOLD,
        },
        projectId: project.id,
        ingestionRunId: project.ingestionRunId,
        sourceFileId: project.sourceFileId,
      },
    ];
  }
}
