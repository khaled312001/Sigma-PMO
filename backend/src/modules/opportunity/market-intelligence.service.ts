import { Injectable } from '@nestjs/common';

import {
  PROJECT_TYPE_ASSUMPTIONS,
  ProjectTypeAssumptions,
  resolveLocationFactor,
  LocationFactor,
  ASSUMPTION_LIBRARY_VERSION,
} from '../feasibility/assumption-library';

/**
 * MarketIntelligenceService — the market-context half of Opportunity
 * Intelligence (Mr. Ayham 2026-06-12). Turns the deterministic Sigma
 * Assumption Library into a readable market snapshot for a (project type,
 * location) pair: demand, supply, competition, industry benchmarks and trend
 * signals — each with an EXPLICIT named basis so nothing is a black box.
 *
 * Deterministic-first: pure functions of PROJECT_TYPE_ASSUMPTIONS +
 * resolveLocationFactor. No clock, no randomness, no external calls — the same
 * inputs always produce the same snapshot.
 */

export interface MarketSignal {
  /** 0–100 normalized strength of the signal. */
  score: number;
  /** One-word qualitative band derived from `score`. */
  band: 'low' | 'moderate' | 'high' | 'very_high';
  /** The named formula/justification behind `score`. */
  basis: string;
}

export interface IndustryBenchmarks {
  /** Stabilized annual revenue as a fraction of CAPEX (the type's yield). */
  annualRevenueYieldPct: number;
  /** Operating cost as a fraction of revenue. */
  opexPctOfRevenue: number;
  /** All-in development cost per m² of built-up area (AED), location-adjusted. */
  costPerSqmBua: number;
  /** Minimum project IRR the recommendation ladder expects (fraction). */
  hurdleIrrPct: number;
  /** Discount rate used for NPV (fraction). */
  discountRatePct: number;
  /** Exit value = stabilized EBITDA × this multiple. */
  terminalValueMultiple: number;
  basis: string;
}

export interface MarketSnapshot {
  projectType: string;
  projectTypeLabel: string;
  city: string | null;
  country: string | null;
  demand: MarketSignal;
  supply: MarketSignal;
  competition: MarketSignal;
  industryBenchmarks: IndustryBenchmarks;
  trends: Array<{ signal: string; direction: 'up' | 'down' | 'flat'; note: string }>;
  factors: {
    assumptionLibraryVersion: string;
    marketStrength: number;
    countryRisk: number;
    costFactor: number;
    sectorRiskScore: number;
  };
}

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, n));
const round1 = (n: number): number => Math.round(n * 10) / 10;
const round0 = (n: number): number => Math.round(n);

function band(score: number): MarketSignal['band'] {
  if (score >= 80) return 'very_high';
  if (score >= 60) return 'high';
  if (score >= 40) return 'moderate';
  return 'low';
}

@Injectable()
export class MarketIntelligenceService {
  /**
   * Build the market snapshot for a (project type, location). Unknown project
   * types fall back to mixed_use; unknown locations to the library default —
   * both deterministic.
   */
  marketSnapshot(projectType: string, city?: string | null, country?: string | null): MarketSnapshot {
    const key = PROJECT_TYPE_ASSUMPTIONS[projectType] ? projectType : 'mixed_use';
    const a: ProjectTypeAssumptions = PROJECT_TYPE_ASSUMPTIONS[key];
    const loc: LocationFactor = resolveLocationFactor(city, country);

    // Demand: market depth (marketStrength) lifted by the sector's revenue
    // yield (high-yield sectors signal stronger end-user demand pull).
    const demandScore = round1(
      clamp(loc.marketStrength * 16 + ((a.annualRevenueYieldPct - 0.08) / (0.3 - 0.08)) * 20),
    );

    // Supply: deeper markets attract more new supply; lower sector risk (lower
    // barriers) means supply comes online faster. A "hot" supply pipeline is
    // not inherently good — it is the competitive backdrop.
    const supplyScore = round1(clamp(loc.marketStrength * 13 + (5 - a.sectorRiskScore) * 9));

    // Competition: the supply pressure read as rivalry intensity (mirrors the
    // screening's competitionPressure so the two surfaces are consistent).
    const competitionScore = round1(clamp(loc.marketStrength * 14 + (5 - a.sectorRiskScore) * 8));

    const trends = this.trends(a, loc);

    return {
      projectType: key,
      projectTypeLabel: a.label,
      city: city ?? null,
      country: country ?? null,
      demand: {
        score: demandScore,
        band: band(demandScore),
        basis: 'marketStrength×16 + yield-pull(annualRevenueYieldPct 8%→0,30%→20)',
      },
      supply: {
        score: supplyScore,
        band: band(supplyScore),
        basis: 'marketStrength×13 + (5−sectorRiskScore)×9 — new-supply pipeline pressure',
      },
      competition: {
        score: competitionScore,
        band: band(competitionScore),
        basis: 'marketStrength×14 + (5−sectorRiskScore)×8 — rivalry intensity',
      },
      industryBenchmarks: {
        annualRevenueYieldPct: a.annualRevenueYieldPct,
        opexPctOfRevenue: a.opexPctOfRevenue,
        // Location-adjust the BUA cost by the construction cost factor.
        costPerSqmBua: round0(a.costPerSqmBua * loc.costFactor),
        hurdleIrrPct: a.hurdleIrrPct,
        discountRatePct: a.discountRatePct,
        terminalValueMultiple: a.terminalValueMultiple,
        basis: `Sigma Assumption Library ${ASSUMPTION_LIBRARY_VERSION}; cost/m² × location costFactor ${loc.costFactor}`,
      },
      trends,
      factors: {
        assumptionLibraryVersion: ASSUMPTION_LIBRARY_VERSION,
        marketStrength: loc.marketStrength,
        countryRisk: loc.countryRisk,
        costFactor: loc.costFactor,
        sectorRiskScore: a.sectorRiskScore,
      },
    };
  }

  /**
   * Deterministic trend signals derived from the library factors. These are
   * structural reads (not time-series): e.g. a deep market with low country
   * risk trends "up" on investability; a high-opex sector trends "down" on
   * margin pressure. Stable for the same inputs.
   */
  private trends(
    a: ProjectTypeAssumptions,
    loc: LocationFactor,
  ): Array<{ signal: string; direction: 'up' | 'down' | 'flat'; note: string }> {
    const investability: 'up' | 'down' | 'flat' =
      loc.marketStrength >= 4 && loc.countryRisk <= 2 ? 'up' : loc.countryRisk >= 4 ? 'down' : 'flat';
    const marginPressure: 'up' | 'down' | 'flat' =
      a.opexPctOfRevenue >= 0.55 ? 'down' : a.opexPctOfRevenue <= 0.3 ? 'up' : 'flat';
    const costPressure: 'up' | 'down' | 'flat' =
      loc.costFactor >= 1.05 ? 'up' : loc.costFactor <= 0.8 ? 'down' : 'flat';
    const exitOutlook: 'up' | 'down' | 'flat' =
      a.terminalValueMultiple >= 13 ? 'up' : a.terminalValueMultiple <= 8 ? 'down' : 'flat';

    return [
      {
        signal: 'investability',
        direction: investability,
        note: `marketStrength ${loc.marketStrength}/5, countryRisk ${loc.countryRisk}/5`,
      },
      {
        signal: 'operating_margin',
        direction: marginPressure,
        note: `opex ${Math.round(a.opexPctOfRevenue * 100)}% of revenue`,
      },
      {
        signal: 'build_cost',
        direction: costPressure,
        note: `location costFactor ${loc.costFactor} vs UAE benchmark 1.0`,
      },
      {
        signal: 'exit_value',
        direction: exitOutlook,
        note: `terminal multiple ${a.terminalValueMultiple}× stabilized EBITDA`,
      },
    ];
  }
}
