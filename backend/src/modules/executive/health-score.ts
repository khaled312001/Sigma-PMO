/**
 * Pure, deterministic health-score band math (no I/O, no Nest).
 *
 * projectHealthScore (0–100) = 40·statusPts + 30·spiPts + 30·cpiPts
 *  - statusPts from the latest 4-tier governance status:
 *      green = 1, yellow = 0.66, orange = 0.33, red = 0, missing = 0.5
 *  - spiPts / cpiPts = clamp((index − 0.7) / 0.4, 0, 1)
 *      (0 at index ≤ 0.7, 1 at index ≥ 1.1; a missing index is neutral 0.5)
 *
 * Kept as standalone functions so both the executive KPI service and the
 * canonical projects-scores service share ONE formula, and so the band math
 * is unit-testable without a database.
 */

export const HEALTH_SCORE_BASIS =
  'health-score-v1: 40*statusPts(green=1,yellow=.66,orange=.33,red=0,missing=.5) ' +
  '+ 30*spiPts + 30*cpiPts, where idxPts=clamp((idx-0.7)/0.4,0,1) and a missing index is neutral 0.5';

/** 4-tier governance status → points in [0,1]. Unknown/missing = neutral 0.5. */
export function statusPoints(status: string | null | undefined): number {
  switch ((status ?? '').toLowerCase()) {
    case 'green': return 1;
    case 'yellow': return 0.66;
    case 'orange': return 0.33;
    case 'red': return 0;
    default: return 0.5;
  }
}

/** SPI/CPI → points: 0 at <=0.7, 1 at >=1.1, linear between. Missing = 0.5. */
export function indexPoints(index: number | null | undefined): number {
  if (index === null || index === undefined || !Number.isFinite(index)) return 0.5;
  return clamp01((index - 0.7) / 0.4);
}

/** The composite 0–100 health score (rounded). */
export function projectHealthScore(
  status: string | null | undefined,
  spi: number | null | undefined,
  cpi: number | null | undefined,
): number {
  return Math.round(40 * statusPoints(status) + 30 * indexPoints(spi) + 30 * indexPoints(cpi));
}

/** Benefit-realization status multiplier (deterministic heuristic v1). */
export function benefitStatusMultiplier(status: string | null | undefined): number {
  switch ((status ?? '').toLowerCase()) {
    case 'green': return 1.0;
    case 'yellow': return 0.85;
    case 'orange': return 0.6;
    case 'red': return 0.4;
    default: return 0.7; // neutral when no status has been computed yet
  }
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
