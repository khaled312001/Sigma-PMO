/**
 * Decision-template catalog (Layer 3 — templates + traceability).
 *
 * One template per alert-code family. Where the runtime `GovernancePolicy`
 * decides WHAT happens for a specific alert instance (responsible party,
 * escalation level computed from age), this catalog is the STATIC reference a
 * reviewer reaches for: the recommended interventions, the governing FIDIC
 * clause, who to notify, and the default escalation tier for that *kind* of
 * deviation. The decisions UI matches an alert's `code` to a template by
 * longest-prefix match so new sub-codes (e.g. `COST_OVERRUN_MATERIALS`)
 * inherit the `COST_OVERRUN` family template automatically.
 *
 * Deterministic + static: this is documentation-as-code, not a live policy.
 * The policy API still owns per-project overrides; this catalog gives the
 * front-end a stable, code-reviewable answer to "what does this rule mean and
 * what should I do about it?" without a DB round-trip.
 */

export interface DecisionTemplate {
  /** Alert-code prefix this template applies to (longest-prefix wins). */
  codePrefix: string;
  /** Short human title for the deviation family. */
  title: string;
  /** Default, ordered intervention playbook. */
  recommendedInterventions: string[];
  /** Governing FIDIC clause reference (Red/Yellow Book 2017 numbering). */
  fidicClause: string | null;
  /** Parties to notify when this template's decision fires. */
  notifyParties: string[];
  /** Default escalation tier (L1 lowest … L3 highest). */
  escalationLevel: 'L1' | 'L2' | 'L3';
}

export const DECISION_TEMPLATES: DecisionTemplate[] = [
  {
    codePrefix: 'SCHEDULE_FINISH_SLIPPED',
    title: 'Activity finished late (schedule slip)',
    recommendedInterventions: [
      'Issue EOT notice under FIDIC Sub-Clause 20.1',
      'Re-baseline schedule with concurrence',
      'Assess delay-damages exposure under 8.5',
    ],
    fidicClause: 'Sub-Clause 8.5 / 20.1',
    notifyParties: ['client', 'sigma'],
    escalationLevel: 'L3',
  },
  {
    codePrefix: 'SCHEDULE_FINISH',
    title: 'Schedule finish deviation',
    recommendedInterventions: [
      'Compare actual vs planned finish on the critical path',
      'Request recovery plan from the Contractor',
    ],
    fidicClause: 'Sub-Clause 8.5',
    notifyParties: ['consultant', 'client'],
    escalationLevel: 'L2',
  },
  {
    codePrefix: 'SCHEDULE_BEHIND_PLAN',
    title: 'Activity behind plan (progress lag)',
    recommendedInterventions: [
      'Request recovery plan (FIDIC 8.6)',
      'Reallocate critical-path resources',
      'Compress non-critical activities (fast-tracking review)',
    ],
    fidicClause: 'Sub-Clause 8.6',
    notifyParties: ['consultant'],
    escalationLevel: 'L2',
  },
  {
    codePrefix: 'COST_OVERRUN',
    title: 'Activity cost overrun',
    recommendedInterventions: [
      'Variation order under Sub-Clause 13 (if scope change)',
      'Cost validation against measured progress',
      'Escalate to client governance for budget reauthorisation',
    ],
    fidicClause: 'Sub-Clause 13 / 14',
    notifyParties: ['client', 'sigma'],
    escalationLevel: 'L3',
  },
  {
    codePrefix: 'DURATION_OVERRUN',
    title: 'Duration overrun on completed activity',
    recommendedInterventions: [
      'Causal analysis (compensable vs Contractor-attributable)',
      'Update remaining-duration estimates',
      'Notify Engineer per 8.4/8.5 if entitlement exists',
    ],
    fidicClause: 'Sub-Clause 8.4 / 8.5',
    notifyParties: ['consultant', 'client'],
    escalationLevel: 'L2',
  },
  {
    codePrefix: 'RESOURCE_UNDERUSE',
    title: 'Resource under-utilisation',
    recommendedInterventions: [
      'Request labour/equipment ramp-up plan from Contractor',
      'Verify subcontractor commitments and mobilisation dates',
    ],
    fidicClause: 'Sub-Clause 8.3 / 8.6',
    notifyParties: ['consultant'],
    escalationLevel: 'L2',
  },
  {
    codePrefix: 'BASELINE_DURATION_OUTLIER',
    title: 'Baseline duration outlier (padding / optimism)',
    recommendedInterventions: [
      'Senior-planner review of the flagged activity vs its peer group',
      'Challenge the Contractor on the estimate before baseline acceptance',
      'Adjust the activity duration to the peer median if unjustified',
    ],
    fidicClause: 'Sub-Clause 8.3',
    notifyParties: ['consultant'],
    escalationLevel: 'L1',
  },
  {
    codePrefix: 'STALE_REPORTING',
    title: 'Stale progress reporting',
    recommendedInterventions: [
      'Issue reporting non-compliance notice (FIDIC 4.21)',
      'Hold daily check-in until cadence restored',
    ],
    fidicClause: 'Sub-Clause 4.21',
    notifyParties: ['contractor'],
    escalationLevel: 'L1',
  },
  // ── L2 cross-source consistency rules (this wave) ──────────────────────
  {
    codePrefix: 'REPORTED_VS_SCHEDULE_MISMATCH',
    title: 'Reported vs schedule progress mismatch',
    recommendedInterventions: [
      'Reconcile the weekly narrative against the P6 schedule actuals',
      'Require the Contractor to substantiate the reported percentage',
      'Withhold certification of progress until the gap is explained',
    ],
    fidicClause: 'Sub-Clause 4.21 / 14.3',
    notifyParties: ['consultant', 'client'],
    escalationLevel: 'L2',
  },
  {
    codePrefix: 'MISSING_WEEKLY_REPORT',
    title: 'Missing weekly progress report',
    recommendedInterventions: [
      'Issue a reporting-cadence reminder to the Contractor',
      'Escalate to a non-compliance notice if the gap persists (FIDIC 4.21)',
    ],
    fidicClause: 'Sub-Clause 4.21',
    notifyParties: ['contractor'],
    escalationLevel: 'L1',
  },
  {
    codePrefix: 'DATA_COMPLETENESS',
    title: 'Low data completeness (governance validation)',
    recommendedInterventions: [
      'Return the dataset to the Contractor for completion of cost/progress fields',
      'Flag dependent analyses as low-confidence until completeness is restored',
      'Re-run the governance review once the gaps are filled',
    ],
    fidicClause: 'Sub-Clause 4.21',
    notifyParties: ['contractor', 'consultant'],
    escalationLevel: 'L1',
  },
];

/**
 * Resolve the template for an alert code by longest-prefix match. Returns null
 * when no family matches (the UI then shows the raw code with no chip).
 *
 * Longest-prefix wins so `SCHEDULE_FINISH_SLIPPED` beats the broader
 * `SCHEDULE_FINISH` for that exact code, while a future `SCHEDULE_FINISH_EARLY`
 * still resolves to the broad family.
 */
export function templateForCode(code: string): DecisionTemplate | null {
  let best: DecisionTemplate | null = null;
  for (const t of DECISION_TEMPLATES) {
    if (code.startsWith(t.codePrefix)) {
      if (!best || t.codePrefix.length > best.codePrefix.length) best = t;
    }
  }
  return best;
}
