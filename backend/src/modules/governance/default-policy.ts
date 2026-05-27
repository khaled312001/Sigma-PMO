/**
 * Default Sigma governance policy (Layer 2). Sensible, FIDIC-grounded
 * baseline that ships out-of-the-box. The client (Al Ayham / Sigma) overrides
 * this per-project through the policy API — proprietary Sigma logic (the
 * IP that stays Sigma's, per the contract) lives in those overrides.
 *
 * FIDIC clause references use the 2017 Red/Yellow Book numbering; mappings
 * here are conservative defaults intended to be adjusted by Sigma's
 * contractual experts.
 */

export interface FidicMapping {
  clause: string;
  notice: string;
  deadlineDays: number | null;
}

export interface EscalationTier {
  /** Min alert age (days) before this tier applies. */
  ageDays: number;
  level: 'L1' | 'L2' | 'L3';
  notify: string[];
}

export interface GovernancePolicyConfig {
  /** Default party responsible per rule code. */
  accountability: Record<string, string>;
  /** FIDIC clause + notice mapping per rule code. */
  fidic: Record<string, FidicMapping>;
  /** PMI/PMBOK process group hints per rule code. */
  pmi: Record<string, string>;
  /** Escalation thresholds by severity → ordered tiers. */
  escalation: Record<'critical' | 'warning' | 'info', EscalationTier>;
  /** Recommended interventions per rule code. */
  intervention: Record<string, string[]>;
}

export const DEFAULT_GOVERNANCE_POLICY: GovernancePolicyConfig = {
  accountability: {
    SCHEDULE_FINISH_SLIPPED: 'contractor',
    SCHEDULE_BEHIND_PLAN: 'contractor',
    DURATION_OVERRUN: 'contractor',
    COST_OVERRUN: 'shared',
    RESOURCE_UNDERUSE: 'contractor',
    STALE_REPORTING: 'contractor',
  },
  fidic: {
    SCHEDULE_FINISH_SLIPPED: {
      clause: 'Sub-Clause 8.5 / 20.1',
      notice: 'Notice of delay; entitlement to EOT to be claimed under Sub-Clause 20.1 within 28 days of awareness.',
      deadlineDays: 28,
    },
    SCHEDULE_BEHIND_PLAN: {
      clause: 'Sub-Clause 8.6',
      notice: 'Rate of progress — Engineer may notify Contractor to submit a revised programme and recovery measures.',
      deadlineDays: 14,
    },
    DURATION_OVERRUN: {
      clause: 'Sub-Clause 8.4 / 8.5',
      notice: 'Extension of Time / Delay damages — assess actual vs planned duration; trigger 8.5 if attributable to Contractor.',
      deadlineDays: 28,
    },
    COST_OVERRUN: {
      clause: 'Sub-Clause 13 / 14',
      notice: 'Variations and adjustments; verify whether overrun is a Variation (13) or Contractor-side overrun (14).',
      deadlineDays: null,
    },
    RESOURCE_UNDERUSE: {
      clause: 'Sub-Clause 8.3 / 8.6',
      notice: 'Programme & rate of progress — Contractor to confirm resource ramp-up plan.',
      deadlineDays: 14,
    },
    STALE_REPORTING: {
      clause: 'Sub-Clause 4.21',
      notice: 'Progress reports — Contractor to provide monthly progress reports until Taking-Over Certificate.',
      deadlineDays: 7,
    },
  },
  pmi: {
    SCHEDULE_FINISH_SLIPPED: 'Monitoring & Controlling — Control Schedule (6.6)',
    SCHEDULE_BEHIND_PLAN: 'Monitoring & Controlling — Control Schedule (6.6)',
    DURATION_OVERRUN: 'Monitoring & Controlling — Control Schedule (6.6)',
    COST_OVERRUN: 'Monitoring & Controlling — Control Costs (7.4)',
    RESOURCE_UNDERUSE: 'Executing — Acquire / Manage Resources (9.3, 9.5)',
    STALE_REPORTING: 'Monitoring & Controlling — Monitor Communications (10.3)',
  },
  escalation: {
    critical: { ageDays: 0, level: 'L3', notify: ['client', 'sigma'] },
    warning: { ageDays: 3, level: 'L2', notify: ['consultant'] },
    info: { ageDays: 7, level: 'L1', notify: ['contractor'] },
  },
  intervention: {
    SCHEDULE_FINISH_SLIPPED: [
      'Issue EOT notice under FIDIC Sub-Clause 20.1',
      'Re-baseline schedule with concurrence',
      'Assess delay-damages exposure under 8.5',
    ],
    SCHEDULE_BEHIND_PLAN: [
      'Request recovery plan (FIDIC 8.6)',
      'Reallocate critical-path resources',
      'Compress non-critical activities (fast-tracking review)',
    ],
    DURATION_OVERRUN: [
      'Causal analysis (compensable vs Contractor-attributable)',
      'Update remaining-duration estimates',
      'Notify Engineer per 8.4/8.5 if entitlement exists',
    ],
    COST_OVERRUN: [
      'Variation order under Sub-Clause 13 (if scope change)',
      'Cost validation against measured progress',
      'Escalate to client governance for budget reauthorisation',
    ],
    RESOURCE_UNDERUSE: [
      'Request labour/equipment ramp-up plan from Contractor',
      'Verify subcontractor commitments and mobilisation dates',
    ],
    STALE_REPORTING: [
      'Issue reporting non-compliance notice (FIDIC 4.21)',
      'Hold daily check-in until cadence restored',
    ],
  },
};
