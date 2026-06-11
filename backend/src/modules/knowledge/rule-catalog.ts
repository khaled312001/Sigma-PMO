/**
 * The Sigma Rule Library catalogue — the deterministic rule codes the L2
 * Validation agent runs, surfaced through the L0 Knowledge & Rules Engine so
 * every layer can reference the same rule definitions. Mirrors the rules wired
 * in `RuleEngineService`; extending the engine adds a row here.
 */
export interface RuleCatalogEntry {
  code: string;
  title: string;
  description: string;
  /** Standards the rule encodes (FIDIC clauses / PMI / AACE references). */
  references: string[];
  defaultSeverity: 'info' | 'warning' | 'critical';
}

export const SIGMA_RULE_LIBRARY: RuleCatalogEntry[] = [
  {
    code: 'SCHEDULE_FINISH_SLIPPED',
    title: 'Schedule finish slipped',
    description: 'Forecast/actual finish is later than the approved baseline finish.',
    references: ['FIDIC 8.4', 'PMI Schedule Management'],
    defaultSeverity: 'critical',
  },
  {
    code: 'SCHEDULE_BEHIND_PLAN',
    title: 'Schedule behind plan',
    description: 'Actual progress trails planned progress beyond tolerance at the data date.',
    references: ['FIDIC 8.3', 'AACE 29R-03'],
    defaultSeverity: 'warning',
  },
  {
    code: 'DURATION_OVERRUN',
    title: 'Activity duration overrun',
    description: 'An activity took materially longer than its planned duration.',
    references: ['PMI Schedule Management'],
    defaultSeverity: 'warning',
  },
  {
    code: 'COST_OVERRUN',
    title: 'Cost overrun',
    description: 'Actual cost exceeds the budgeted cost beyond tolerance.',
    references: ['FIDIC 13/14', 'AACE 17R-97'],
    defaultSeverity: 'critical',
  },
  {
    code: 'RESOURCE_UNDERUSE',
    title: 'Resource under-utilisation',
    description: 'Assigned resource usage is materially below plan, risking productivity loss.',
    references: ['AACE 25R-03'],
    defaultSeverity: 'info',
  },
  {
    code: 'STALE_REPORTING',
    title: 'Stale reporting',
    description: 'No progress report received within the expected reporting cadence.',
    references: ['Governance SOP — reporting cadence'],
    defaultSeverity: 'warning',
  },
  {
    code: 'BASELINE_DURATION_OUTLIER',
    title: 'Baseline duration outlier',
    description: 'A synthesised/edited baseline activity duration is a statistical outlier.',
    references: ['Sigma planning method-of-works'],
    defaultSeverity: 'info',
  },
];
