/**
 * mitigation-library.ts — a deterministic, versioned catalogue of mitigation
 * options keyed by risk category (Mr. Ayham's L5 mitigation recommendations).
 *
 * This is the single source of truth for the rule-based matcher in
 * RiskExtrasService: no LLM is involved. Each option carries a concrete
 * `action` and a `when` trigger so a reviewer can pick the right play without
 * re-deriving it. Label every emitted set with `MITIGATION_LIBRARY_VERSION`.
 */

export const MITIGATION_LIBRARY_VERSION = 'sigma-mitigation-library-v1';

export interface MitigationOption {
  title: string;
  action: string;
  /** When this play applies (the trigger condition a reviewer checks). */
  when: string;
  /** Relative effort/strength tier — lets the matcher rank by severity. */
  weight: 'preventive' | 'corrective' | 'recovery';
}

/**
 * The catalogue. Canonical category keys mirror the Risk entity's `category`
 * field (`schedule | cost | quality | contractual | resource | safety`) plus an
 * `external` bucket for force-majeure / third-party events. `contract` is kept
 * as an alias of `contractual` so both spellings resolve.
 */
export const MITIGATION_LIBRARY: Record<string, MitigationOption[]> = {
  schedule: [
    {
      title: 'Critical-path recovery analysis',
      action:
        'Run a forensic critical-path analysis on the lagging paths; resequence or fast-track ' +
        'non-dependent work and re-issue the recovery baseline.',
      when: 'SPI < 1 or forecast finish later than the approved baseline.',
      weight: 'corrective',
    },
    {
      title: 'Schedule acceleration',
      action:
        'Add shifts/crews or overtime on the controlling activities; quantify the acceleration cost ' +
        'and seek the Engineer’s instruction before committing.',
      when: 'Recovery analysis shows the float is fully consumed and the milestone is at risk.',
      weight: 'recovery',
    },
    {
      title: 'Early-warning notice',
      action:
        'Serve a contractual early-warning notice and assess EOT entitlement so the delay is ' +
        'preserved on record before the window closes.',
      when: 'A delay event is identified that may not be the contractor’s risk.',
      weight: 'preventive',
    },
  ],
  cost: [
    {
      title: 'Re-baseline the cost forecast (EAC)',
      action:
        'Recompute EAC from the current CPI; reconcile committed vs incurred cost and surface the ' +
        'variance to the cost-control board.',
      when: 'CPI < 1 or EAC projects an overrun versus BAC.',
      weight: 'corrective',
    },
    {
      title: 'Tighten change control',
      action:
        'Freeze discretionary spend and route every variation through formal change control so no ' +
        'un-instructed cost is incurred.',
      when: 'Cost overrun is driven by scope creep or un-instructed variations.',
      weight: 'preventive',
    },
    {
      title: 'Value-engineering review',
      action:
        'Convene a value-engineering workshop on the remaining scope to recover margin without ' +
        'compromising the specification.',
      when: 'The overrun is structural and unlikely to self-correct.',
      weight: 'recovery',
    },
  ],
  resource: [
    {
      title: 'Re-level resources to the critical path',
      action:
        'Re-level labour, plant and equipment onto the controlling activities and confirm ' +
        'subcontractor mobilisation dates.',
      when: 'Resource under-use or over-allocation is detected on near-term work.',
      weight: 'corrective',
    },
    {
      title: 'Secure additional capacity',
      action:
        'Pre-order long-lead resources and pre-qualify a backup subcontractor to remove the single ' +
        'point of failure.',
      when: 'A key resource is fully loaded with no contingency.',
      weight: 'preventive',
    },
    {
      title: 'Productivity intervention',
      action:
        'Investigate the productivity drivers (access, weather, rework) and revise remaining-duration ' +
        'estimates with the field team.',
      when: 'Actual output is materially below the planned production rate.',
      weight: 'recovery',
    },
  ],
  quality: [
    {
      title: 'Root-cause and corrective action',
      action:
        'Raise an NCR, perform a root-cause analysis and define a corrective action with an owner and ' +
        'a verification step.',
      when: 'A non-conformance or repeated defect is observed.',
      weight: 'corrective',
    },
    {
      title: 'Inspection & test plan reinforcement',
      action:
        'Tighten the ITP hold/witness points on the affected work package and add an independent ' +
        'check before cover-up.',
      when: 'Quality issues recur on a specific trade or package.',
      weight: 'preventive',
    },
    {
      title: 'Rework & re-certification',
      action:
        'Plan the rework, re-test, and obtain re-certification; assess the schedule/cost impact of the ' +
        'rework loop.',
      when: 'Completed work fails acceptance and must be redone.',
      weight: 'recovery',
    },
  ],
  contractual: [
    {
      title: 'Preserve the contractual record',
      action:
        'Issue the required notices within the contractual deadline and compile the contemporaneous ' +
        'records so entitlement is not time-barred.',
      when: 'A claim event arises (delay, variation, employer risk).',
      weight: 'preventive',
    },
    {
      title: 'Entitlement & quantum assessment',
      action:
        'Assess entitlement against the FIDIC sub-clause, quantify time and cost, and prepare the ' +
        'substantiation pack.',
      when: 'An event with potential time/cost entitlement is confirmed.',
      weight: 'corrective',
    },
    {
      title: 'Escalate to dispute avoidance',
      action:
        'Refer the matter to amicable settlement / the DAB before it crystallises into a formal ' +
        'dispute.',
      when: 'The parties disagree on liability and the value is material.',
      weight: 'recovery',
    },
  ],
  safety: [
    {
      title: 'Stop-work and hazard control',
      action:
        'Issue a stop-work on the affected activity, isolate the hazard and brief the crew before ' +
        'resuming under a revised method statement.',
      when: 'An unsafe condition or near-miss is identified.',
      weight: 'corrective',
    },
    {
      title: 'Method-statement & permit review',
      action:
        'Review the method statement and permit-to-work regime; add the missing controls to the risk ' +
        'assessment.',
      when: 'A recurring hazard points to a control gap.',
      weight: 'preventive',
    },
  ],
  external: [
    {
      title: 'Force-majeure / external-event notice',
      action:
        'Serve the contractual notice for the external event, record its duration and impact, and ' +
        'invoke the relevant relief sub-clause.',
      when: 'A weather, regulatory or third-party event impacts the works.',
      weight: 'corrective',
    },
    {
      title: 'Contingency activation',
      action:
        'Activate the schedule/cost contingency reserve against the realised external risk and ' +
        'replan the affected window.',
      when: 'An external risk that was on the register materialises.',
      weight: 'recovery',
    },
  ],
};

/** Map a stored category onto a catalogue key (handles `contract` ⇄ `contractual`). */
export function resolveCategoryKey(category: string): string {
  const c = (category || '').trim().toLowerCase();
  if (c === 'contract') return 'contractual';
  if (MITIGATION_LIBRARY[c]) return c;
  // Heuristic fallbacks for free-text categories.
  if (c.includes('sched') || c.includes('delay') || c.includes('time')) return 'schedule';
  if (c.includes('cost') || c.includes('budget') || c.includes('financ')) return 'cost';
  if (c.includes('resource') || c.includes('labour') || c.includes('labor') || c.includes('plant')) return 'resource';
  if (c.includes('qual') || c.includes('defect') || c.includes('ncr')) return 'quality';
  if (c.includes('contract') || c.includes('claim') || c.includes('legal')) return 'contractual';
  if (c.includes('safe') || c.includes('hse') || c.includes('hazard')) return 'safety';
  return 'external';
}

export interface MatchedMitigations {
  category: string;
  resolvedCategory: string;
  source: string;
  options: MitigationOption[];
}

/**
 * Rule-based matcher: pick 2–3 options for a risk by category + severity.
 *  - For high/critical risks, lead with the corrective + recovery plays.
 *  - For low/medium risks, lead with the preventive + corrective plays.
 * Always returns 2–3 options (deduped, order-stable).
 */
export function matchMitigations(category: string, tier: string): MatchedMitigations {
  const key = resolveCategoryKey(category);
  const all = MITIGATION_LIBRARY[key] ?? MITIGATION_LIBRARY.external;
  const severe = tier === 'high' || tier === 'critical';

  const ranked = [...all].sort((a, b) => weightRank(a.weight, severe) - weightRank(b.weight, severe));
  const options = ranked.slice(0, 3);

  return {
    category,
    resolvedCategory: key,
    source: MITIGATION_LIBRARY_VERSION,
    options,
  };
}

function weightRank(w: MitigationOption['weight'], severe: boolean): number {
  if (severe) {
    // Severe risks: recovery first, then corrective, then preventive.
    return w === 'recovery' ? 0 : w === 'corrective' ? 1 : 2;
  }
  // Routine risks: preventive first, then corrective, then recovery.
  return w === 'preventive' ? 0 : w === 'corrective' ? 1 : 2;
}
