/**
 * The Sigma Feasibility Assumption Library — the "internal knowledge &
 * reference assumptions" Level 1 reasons against (Mr. Ayham, 2026-06-11
 * follow-up). Deterministic benchmarks per project type + location factors.
 *
 * Same governance discipline as the Sigma Rule Library: a versioned,
 * code-reviewed catalogue. Every assessment snapshots the resolved values onto
 * the `FeasibilityAssessment` row, so changing a benchmark here NEVER rewrites
 * history — it only affects future runs. Tuning a benchmark is a one-line
 * change; adding a project type is a new entry, never a schema change.
 */

export const ASSUMPTION_LIBRARY_VERSION = 'sigma-feasibility-v1';

export interface ProjectTypeAssumptions {
  label: string;
  /** CAPEX split (must sum to 1). */
  capexSplit: { land: number; construction: number; softCosts: number; contingency: number };
  /** Stabilized annual revenue as a fraction of total CAPEX. */
  annualRevenueYieldPct: number;
  /** Operating cost as a fraction of revenue. */
  opexPctOfRevenue: number;
  /** Years of construction before operations start (CAPEX spread evenly). */
  constructionYears: number;
  /** Revenue ramp-up multipliers for the first operating years (then 1.0). */
  rampUp: number[];
  /** Operating horizon = the reference HOLD PERIOD (develop → stabilize →
   *  exit); the model assumes a market exit at the end of it. */
  horizonYears: number;
  /** Discount rate for NPV (weighted nominal, fraction). */
  discountRatePct: number;
  /** Minimum project IRR the recommendation ladder expects (fraction). */
  hurdleIrrPct: number;
  /** Exit value at horizon end = stabilized EBITDA × this multiple
   *  (cap-rate-implied market value, i.e. multiple ≈ 1 / cap rate). */
  terminalValueMultiple: number;
  /** Sector volatility/complexity, 1 (stable) … 5 (volatile). */
  sectorRiskScore: number;
  /** All-in development cost per m² of built-up area (AED) — drives the
   *  sketch path when the investor has an area but no CAPEX figure. */
  costPerSqmBua: number;
  /** Corporate tax applied in the Level-2 financial statements (fraction). */
  taxRatePct: number;
}

export const PROJECT_TYPE_ASSUMPTIONS: Record<string, ProjectTypeAssumptions> = {
  residential: {
    label: 'Residential development',
    capexSplit: { land: 0.25, construction: 0.55, softCosts: 0.12, contingency: 0.08 },
    annualRevenueYieldPct: 0.12,
    opexPctOfRevenue: 0.28,
    constructionYears: 2,
    rampUp: [0.55, 0.8, 0.95],
    horizonYears: 7,
    discountRatePct: 0.1,
    hurdleIrrPct: 0.12,
    terminalValueMultiple: 15,
    sectorRiskScore: 2,
    costPerSqmBua: 4200,
    taxRatePct: 0.09,
  },
  commercial_office: {
    label: 'Commercial office',
    capexSplit: { land: 0.28, construction: 0.52, softCosts: 0.12, contingency: 0.08 },
    annualRevenueYieldPct: 0.11,
    opexPctOfRevenue: 0.3,
    constructionYears: 2,
    rampUp: [0.45, 0.7, 0.9],
    horizonYears: 8,
    discountRatePct: 0.1,
    hurdleIrrPct: 0.115,
    terminalValueMultiple: 13,
    sectorRiskScore: 3,
    costPerSqmBua: 4800,
    taxRatePct: 0.09,
  },
  retail: {
    label: 'Retail / mall',
    capexSplit: { land: 0.26, construction: 0.52, softCosts: 0.13, contingency: 0.09 },
    annualRevenueYieldPct: 0.13,
    opexPctOfRevenue: 0.34,
    constructionYears: 2,
    rampUp: [0.5, 0.75, 0.92],
    horizonYears: 8,
    discountRatePct: 0.105,
    hurdleIrrPct: 0.125,
    terminalValueMultiple: 12,
    sectorRiskScore: 3,
    costPerSqmBua: 5200,
    taxRatePct: 0.09,
  },
  hospitality: {
    label: 'Hospitality / hotel',
    capexSplit: { land: 0.22, construction: 0.55, softCosts: 0.14, contingency: 0.09 },
    annualRevenueYieldPct: 0.22,
    opexPctOfRevenue: 0.58,
    constructionYears: 3,
    rampUp: [0.45, 0.65, 0.85, 0.95],
    horizonYears: 8,
    discountRatePct: 0.11,
    hurdleIrrPct: 0.13,
    terminalValueMultiple: 10,
    sectorRiskScore: 4,
    costPerSqmBua: 8500,
    taxRatePct: 0.09,
  },
  industrial: {
    label: 'Industrial / manufacturing',
    capexSplit: { land: 0.15, construction: 0.45, softCosts: 0.1, contingency: 0.08 },
    annualRevenueYieldPct: 0.4,
    opexPctOfRevenue: 0.72,
    constructionYears: 2,
    rampUp: [0.5, 0.75, 0.9],
    horizonYears: 8,
    discountRatePct: 0.11,
    hurdleIrrPct: 0.14,
    terminalValueMultiple: 7.5,
    sectorRiskScore: 4,
    costPerSqmBua: 3500,
    taxRatePct: 0.09,
  },
  logistics: {
    label: 'Logistics / warehousing',
    capexSplit: { land: 0.2, construction: 0.55, softCosts: 0.15, contingency: 0.1 },
    annualRevenueYieldPct: 0.115,
    opexPctOfRevenue: 0.25,
    constructionYears: 1,
    rampUp: [0.6, 0.85],
    horizonYears: 7,
    discountRatePct: 0.095,
    hurdleIrrPct: 0.11,
    terminalValueMultiple: 13,
    sectorRiskScore: 2,
    costPerSqmBua: 2800,
    taxRatePct: 0.09,
  },
  healthcare: {
    label: 'Healthcare facility',
    capexSplit: { land: 0.18, construction: 0.5, softCosts: 0.2, contingency: 0.12 },
    annualRevenueYieldPct: 0.3,
    opexPctOfRevenue: 0.62,
    constructionYears: 2,
    rampUp: [0.4, 0.65, 0.85, 0.95],
    horizonYears: 10,
    discountRatePct: 0.105,
    hurdleIrrPct: 0.12,
    terminalValueMultiple: 10,
    sectorRiskScore: 3,
    costPerSqmBua: 7200,
    taxRatePct: 0.09,
  },
  education: {
    label: 'Education facility',
    capexSplit: { land: 0.2, construction: 0.55, softCosts: 0.15, contingency: 0.1 },
    annualRevenueYieldPct: 0.22,
    opexPctOfRevenue: 0.6,
    constructionYears: 2,
    rampUp: [0.5, 0.7, 0.85, 0.95],
    horizonYears: 12,
    discountRatePct: 0.095,
    hurdleIrrPct: 0.11,
    terminalValueMultiple: 11,
    sectorRiskScore: 2,
    costPerSqmBua: 4600,
    taxRatePct: 0.09,
  },
  mixed_use: {
    label: 'Mixed-use development',
    capexSplit: { land: 0.25, construction: 0.53, softCosts: 0.13, contingency: 0.09 },
    annualRevenueYieldPct: 0.125,
    opexPctOfRevenue: 0.32,
    constructionYears: 3,
    rampUp: [0.5, 0.72, 0.9],
    horizonYears: 8,
    discountRatePct: 0.105,
    hurdleIrrPct: 0.12,
    terminalValueMultiple: 13,
    sectorRiskScore: 3,
    costPerSqmBua: 5000,
    taxRatePct: 0.09,
  },
  infrastructure: {
    label: 'Infrastructure / utilities',
    capexSplit: { land: 0.08, construction: 0.62, softCosts: 0.18, contingency: 0.12 },
    annualRevenueYieldPct: 0.12,
    opexPctOfRevenue: 0.35,
    constructionYears: 4,
    rampUp: [0.7, 0.9],
    horizonYears: 20,
    discountRatePct: 0.085,
    hurdleIrrPct: 0.095,
    terminalValueMultiple: 10,
    sectorRiskScore: 3,
    costPerSqmBua: 0, // not area-driven — CAPEX must be provided
    taxRatePct: 0.09,
  },
};

export interface LocationFactor {
  /** Construction cost multiplier vs the UAE benchmark. */
  costFactor: number;
  /** Demand/market depth, 1 (thin) … 5 (deep). */
  marketStrength: number;
  /** Country/regulatory risk, 1 (low) … 5 (high). */
  countryRisk: number;
}

/** Keyed by lowercase city, then lowercase country, then 'default'. */
export const LOCATION_FACTORS: Record<string, LocationFactor> = {
  dubai: { costFactor: 1.0, marketStrength: 5, countryRisk: 1 },
  'abu dhabi': { costFactor: 0.97, marketStrength: 4, countryRisk: 1 },
  sharjah: { costFactor: 0.88, marketStrength: 3, countryRisk: 1 },
  uae: { costFactor: 0.95, marketStrength: 4, countryRisk: 1 },
  riyadh: { costFactor: 1.05, marketStrength: 4, countryRisk: 2 },
  jeddah: { costFactor: 1.0, marketStrength: 3, countryRisk: 2 },
  'saudi arabia': { costFactor: 1.02, marketStrength: 4, countryRisk: 2 },
  doha: { costFactor: 1.08, marketStrength: 3, countryRisk: 1 },
  qatar: { costFactor: 1.08, marketStrength: 3, countryRisk: 1 },
  cairo: { costFactor: 0.55, marketStrength: 3, countryRisk: 4 },
  egypt: { costFactor: 0.55, marketStrength: 3, countryRisk: 4 },
  default: { costFactor: 1.0, marketStrength: 3, countryRisk: 3 },
};

/** Resolve a location factor: city beats country beats default. */
export function resolveLocationFactor(city?: string | null, country?: string | null): LocationFactor {
  const c = city?.trim().toLowerCase();
  if (c && LOCATION_FACTORS[c]) return LOCATION_FACTORS[c];
  const k = country?.trim().toLowerCase();
  if (k && LOCATION_FACTORS[k]) return LOCATION_FACTORS[k];
  return LOCATION_FACTORS.default;
}

export const PROJECT_TYPES = Object.keys(PROJECT_TYPE_ASSUMPTIONS);
