/**
 * rollup-math.ts — PURE, deterministic aggregation helpers for the hierarchy
 * roll-up surface (`GET /hierarchy/rollups`). No I/O, no NestJS, no TypeORM:
 * every function here is a plain transform so it is unit-testable in isolation
 * (the BAC-weighted parent aggregation is the highest-risk piece and is
 * covered by `rollup-math.spec.ts`).
 *
 * The platform discipline applies: all numbers come from explicit formulas with
 * named bases — never an LLM.
 */

import { GovernanceStatus, GOVERNANCE_STATUS_RANK } from '../../common/enums';

/** Status multiplier applied to EV/BAC when deriving benefit-realization %. */
export const STATUS_BENEFIT_MULTIPLIER: Record<string, number> = {
  green: 1,
  yellow: 0.85,
  orange: 0.6,
  red: 0.4,
};

/** The leaf metrics for one project, already computed from canonical rows. */
export interface ProjectRollupMetrics {
  bac: number;
  ev: number;
  pv: number;
  ac: number;
  /** SPI = EV/PV (null when PV is 0). */
  spi: number | null;
  /** CPI = EV/AC (null when AC is 0). */
  cpi: number | null;
  /** 4-tier governance status, or null when never computed. */
  governanceStatus: string | null;
  openRiskCount: number;
  maxRiskScore: number;
  openClaimCount: number;
  claimExposure: number;
  /** Benefit-realization % in [0,100]. */
  benefitRealizationPct: number;
}

/**
 * Benefit-realization heuristic (shared by project + roll-up + the command
 * center): how much of the budgeted benefit is being realized given progress
 * AND governance health. realized = (EV/BAC) × statusMultiplier, scaled to %.
 */
export function benefitRealizationPct(
  ev: number,
  bac: number,
  status: string | null,
): number {
  if (bac <= 0) return 0;
  const mult = STATUS_BENEFIT_MULTIPLIER[status ?? ''] ?? 1;
  return Math.round(100 * (ev / bac) * mult);
}

/** SPI/CPI safe division (null when the denominator is 0). */
export function safeIndex(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

/** Worst-of-children status (matches the governance-status roll-up rule). */
export function worstOfStatuses(statuses: Array<string | null>): string | null {
  const known = statuses.filter((s): s is string => s != null && s in GOVERNANCE_STATUS_RANK);
  if (known.length === 0) return null;
  let worst: GovernanceStatus = GovernanceStatus.GREEN;
  for (const s of known) {
    if (GOVERNANCE_STATUS_RANK[s as GovernanceStatus] > GOVERNANCE_STATUS_RANK[worst]) {
      worst = s as GovernanceStatus;
    }
  }
  return worst;
}

/**
 * BAC-weighted parent aggregation — THE testable core. Given the leaf metrics
 * of every child, produce the parent's metrics:
 *
 *  - cost/schedule indices (cpi/spi) and benefit% are BAC-weighted means: each
 *    child contributes in proportion to its share of the parent's total BAC, so
 *    a $100M project dominates a $1M one (a plain average would not).
 *  - risk/claim counts + exposure are summed; maxRiskScore is the max.
 *  - status is worst-of-children when the parent has no own snapshot.
 *
 * Pure: no I/O. `ownStatus` lets a parent that DOES carry its own snapshot keep
 * it; pass null to fall back to worst-of-children.
 */
export function aggregateChildren(
  children: ProjectRollupMetrics[],
  ownStatus: string | null,
): ProjectRollupMetrics {
  const totalBac = children.reduce((s, c) => s + c.bac, 0);
  const sum = children.reduce(
    (acc, c) => {
      acc.ev += c.ev;
      acc.pv += c.pv;
      acc.ac += c.ac;
      acc.openRiskCount += c.openRiskCount;
      acc.openClaimCount += c.openClaimCount;
      acc.claimExposure += c.claimExposure;
      acc.maxRiskScore = Math.max(acc.maxRiskScore, c.maxRiskScore);
      return acc;
    },
    { ev: 0, pv: 0, ac: 0, openRiskCount: 0, openClaimCount: 0, claimExposure: 0, maxRiskScore: 0 },
  );

  // BAC-weighted means for the indices + benefit. When a child's index is null
  // (no PV/AC), it contributes nothing AND its weight is dropped, so the parent
  // index reflects only the children that actually have one.
  const weighted = (pick: (c: ProjectRollupMetrics) => number | null) => {
    let num = 0;
    let den = 0;
    for (const c of children) {
      const v = pick(c);
      if (v === null || c.bac <= 0) continue;
      num += v * c.bac;
      den += c.bac;
    }
    return den > 0 ? Math.round((num / den) * 1000) / 1000 : null;
  };

  const status = ownStatus ?? worstOfStatuses(children.map((c) => c.governanceStatus));
  const benefit = totalBac > 0
    ? Math.round(
        children.reduce((s, c) => s + c.benefitRealizationPct * c.bac, 0) / totalBac,
      )
    : 0;

  return {
    bac: Math.round(totalBac * 100) / 100,
    ev: Math.round(sum.ev * 100) / 100,
    pv: Math.round(sum.pv * 100) / 100,
    ac: Math.round(sum.ac * 100) / 100,
    spi: weighted((c) => c.spi),
    cpi: weighted((c) => c.cpi),
    governanceStatus: status,
    openRiskCount: sum.openRiskCount,
    maxRiskScore: sum.maxRiskScore,
    openClaimCount: sum.openClaimCount,
    claimExposure: Math.round(sum.claimExposure * 100) / 100,
    benefitRealizationPct: benefit,
  };
}
