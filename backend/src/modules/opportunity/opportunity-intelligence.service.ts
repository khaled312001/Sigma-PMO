import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GovernanceStatus } from '../../common/enums';
import { OpportunityScreening } from '../canonical/entities';
import {
  PROJECT_TYPE_ASSUMPTIONS,
  PROJECT_TYPES,
  ProjectTypeAssumptions,
  resolveLocationFactor,
  LocationFactor,
  ASSUMPTION_LIBRARY_VERSION,
} from '../feasibility/assumption-library';

/**
 * OpportunityIntelligenceService — the FIRST gate of the investment lifecycle
 * (Idea → Opportunity Intelligence → Rapid Assessment → Feasibility →
 * Bankability → Investment Governance), Mr. Ayham 2026-06-12 active scope.
 *
 * Deterministic-first: every one of the five 0–100 sub-scores comes from an
 * explicit named formula over the Sigma Feasibility Assumption Library
 * (PROJECT_TYPE_ASSUMPTIONS) + the resolved location factor — NO randomness,
 * NO system-clock reads. Re-running the same inputs always yields the same
 * scores, so the recommendation (proceed/watchlist/reject) is reproducible and
 * auditable. The AI layer only narrates these numbers; it never computes them.
 */

export interface CreateScreeningInput {
  title: string;
  projectType: string;
  country?: string | null;
  city?: string | null;
  /** Estimated total investment / CAPEX (project currency). */
  estimatedInvestment?: number | null;
  currency?: string;
  businessObjective?: string | null;
  /** Free-form funding-mix note, e.g. "60% senior debt / 40% equity". */
  fundingStructure?: string | null;
  createdBy?: string | null;
}

/** The five deterministic 0–100 sub-scores + the composite. */
export interface OpportunityScores {
  /** 0–100 composite (weighted blend of the four pillars). */
  opportunityScore: number;
  /** Demand depth + sector yield headroom (higher = more attractive). */
  marketAttractiveness: number;
  /** Competition intensity inverted — LESS competition ⇒ HIGHER score. */
  competitionScore: number;
  /** Funding/financeability: lower hurdle + healthier debt capacity. */
  fundingAttractiveness: number;
  /** Regulatory + country/sector complexity — HIGHER = WORSE (more complex). */
  regulatoryComplexity: number;
  /** Named basis strings so every number is explainable in the UI. */
  basis: Record<string, string>;
  factors: {
    assumptionLibraryVersion: string;
    sectorRiskScore: number;
    hurdleIrrPct: number;
    annualRevenueYieldPct: number;
    marketStrength: number;
    countryRisk: number;
    costFactor: number;
  };
}

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, n));
const round1 = (n: number): number => Math.round(n * 10) / 10;

@Injectable()
export class OpportunityIntelligenceService {
  constructor(
    @InjectRepository(OpportunityScreening)
    private readonly screenings: Repository<OpportunityScreening>,
  ) {}

  /** Project types the screener accepts (the library keys). */
  projectTypes(): string[] {
    return PROJECT_TYPES;
  }

  /**
   * Pure scoring core — exported so the agent can re-score WITHOUT a re-write.
   * Deterministic over the library; no I/O, no clock, no randomness.
   */
  computeScores(projectType: string, city?: string | null, country?: string | null): OpportunityScores {
    const a: ProjectTypeAssumptions =
      PROJECT_TYPE_ASSUMPTIONS[projectType] ?? PROJECT_TYPE_ASSUMPTIONS.mixed_use;
    const loc: LocationFactor = resolveLocationFactor(city, country);

    // --- Market attractiveness ----------------------------------------------
    // Demand depth (marketStrength 1..5 → 20..100) blended 60/40 with the
    // sector's stabilized yield headroom (annualRevenueYieldPct mapped 8%→0,
    // 30%→100, capped). High-yield sectors in deep markets score highest.
    const demandComponent = loc.marketStrength * 20; // 20..100
    const yieldHeadroom = clamp(((a.annualRevenueYieldPct - 0.08) / (0.3 - 0.08)) * 100);
    const marketAttractiveness = round1(clamp(0.6 * demandComponent + 0.4 * yieldHeadroom));

    // --- Competition (LESS competition ⇒ HIGHER) ----------------------------
    // Proxy: competition rises with market depth (crowded mature markets) and
    // with sector commoditization (low sectorRiskScore ⇒ low barriers ⇒ more
    // entrants). We score the INVERSE so a defensible, less-contested position
    // scores high. competitionPressure ∈ [0,100]; score = 100 − pressure.
    const competitionPressure = clamp(loc.marketStrength * 14 + (5 - a.sectorRiskScore) * 8);
    const competitionScore = round1(clamp(100 - competitionPressure));

    // --- Funding attractiveness ---------------------------------------------
    // Financeability improves as the IRR hurdle falls (cheaper to clear) and as
    // country risk falls (cheaper debt, deeper lender appetite). hurdleIrrPct
    // mapped 8%→100 .. 16%→0; countryRisk 1..5 → 100..20; blended 60/40.
    const hurdleComponent = clamp(((0.16 - a.hurdleIrrPct) / (0.16 - 0.08)) * 100);
    const countryFundingComponent = clamp((6 - loc.countryRisk) * 20); // 1→100 … 5→20
    const fundingAttractiveness = round1(clamp(0.6 * hurdleComponent + 0.4 * countryFundingComponent));

    // --- Regulatory complexity (HIGHER = WORSE) -----------------------------
    // Country/regulatory risk (60%) + sector complexity (40%). countryRisk
    // 1..5 → 10..90; sectorRiskScore 1..5 → 10..90. This is the only score
    // where a HIGH number is a NEGATIVE signal (it pulls the composite down).
    const regCountry = loc.countryRisk * 18 - 8; // 1→10 … 5→82
    const regSector = a.sectorRiskScore * 18 - 8;
    const regulatoryComplexity = round1(clamp(0.6 * regCountry + 0.4 * regSector));

    // --- Composite ----------------------------------------------------------
    // Weighted blend of the four pillars; regulatoryComplexity enters inverted
    // (100 − complexity) so a simpler regime lifts the opportunity. Weights:
    // market 0.35, competition 0.20, funding 0.30, regulatory-ease 0.15.
    const opportunityScore = round1(
      clamp(
        0.35 * marketAttractiveness +
          0.2 * competitionScore +
          0.3 * fundingAttractiveness +
          0.15 * (100 - regulatoryComplexity),
      ),
    );

    return {
      opportunityScore,
      marketAttractiveness,
      competitionScore,
      fundingAttractiveness,
      regulatoryComplexity,
      basis: {
        marketAttractiveness:
          '0.6×(marketStrength×20) + 0.4×yield-headroom(annualRevenueYieldPct 8%→0,30%→100)',
        competitionScore:
          '100 − [marketStrength×14 + (5−sectorRiskScore)×8] — less contested ⇒ higher',
        fundingAttractiveness:
          '0.6×hurdle-ease(IRR 8%→100,16%→0) + 0.4×(6−countryRisk)×20',
        regulatoryComplexity:
          '0.6×(countryRisk×18−8) + 0.4×(sectorRiskScore×18−8) — higher = worse',
        opportunityScore:
          '0.35×market + 0.20×competition + 0.30×funding + 0.15×(100−regulatory)',
        recommendation: 'proceed_to_feasibility ≥65 · watchlist 45–65 · reject <45',
        library: ASSUMPTION_LIBRARY_VERSION,
      },
      factors: {
        assumptionLibraryVersion: ASSUMPTION_LIBRARY_VERSION,
        sectorRiskScore: a.sectorRiskScore,
        hurdleIrrPct: a.hurdleIrrPct,
        annualRevenueYieldPct: a.annualRevenueYieldPct,
        marketStrength: loc.marketStrength,
        countryRisk: loc.countryRisk,
        costFactor: loc.costFactor,
      },
    };
  }

  /** proceed_to_feasibility (≥65) | watchlist (45–65) | reject (<45). */
  recommend(opportunityScore: number): string {
    if (opportunityScore >= 65) return 'proceed_to_feasibility';
    if (opportunityScore >= 45) return 'watchlist';
    return 'reject';
  }

  /**
   * Map the composite onto the 4-tier governance status. Aligned with the
   * recommendation ladder, with an extra Red floor below 35 (clearly weak
   * opportunities are an explicit governance flag, not merely "reject").
   */
  governanceStatus(opportunityScore: number): GovernanceStatus {
    if (opportunityScore >= 65) return GovernanceStatus.GREEN;
    if (opportunityScore >= 45) return GovernanceStatus.YELLOW;
    if (opportunityScore >= 35) return GovernanceStatus.ORANGE;
    return GovernanceStatus.RED;
  }

  /** OPP-#### from the current row count (deterministic, monotonic). */
  private async nextCode(): Promise<string> {
    const count = await this.screenings.count();
    return `OPP-${String(count + 1).padStart(4, '0')}`;
  }

  /** Create + persist a screening with its deterministic scores. */
  async createScreening(input: CreateScreeningInput): Promise<OpportunityScreening> {
    const projectType = PROJECT_TYPE_ASSUMPTIONS[input.projectType]
      ? input.projectType
      : 'mixed_use';
    const scores = this.computeScores(projectType, input.city, input.country);
    const recommendation = this.recommend(scores.opportunityScore);
    const status = this.governanceStatus(scores.opportunityScore);
    const code = await this.nextCode();

    const row = this.screenings.create({
      code,
      title: input.title,
      projectType,
      country: input.country ?? null,
      city: input.city ?? null,
      estimatedInvestment:
        input.estimatedInvestment != null && Number.isFinite(input.estimatedInvestment)
          ? String(input.estimatedInvestment)
          : null,
      currency: input.currency ?? 'AED',
      inputs: {
        businessObjective: input.businessObjective ?? null,
        fundingStructure: input.fundingStructure ?? null,
        requestedProjectType: input.projectType,
        resolvedProjectType: projectType,
      },
      scores: scores as unknown as Record<string, unknown>,
      opportunityScore: scores.opportunityScore,
      recommendation,
      governanceStatus: status,
      createdBy: input.createdBy ?? null,
    });
    return this.screenings.save(row);
  }

  list(): Promise<OpportunityScreening[]> {
    return this.screenings.find({ order: { createdAt: 'DESC' } });
  }

  get(id: string): Promise<OpportunityScreening | null> {
    return this.screenings.findOne({ where: { id } });
  }

  /**
   * Re-score an existing screening from the CURRENT library (used by the
   * agent). Returns the updated row; the recommendation + governanceStatus are
   * recomputed so a library tuning is reflected on re-run.
   */
  async rescore(id: string): Promise<OpportunityScreening | null> {
    const row = await this.get(id);
    if (!row) return null;
    const scores = this.computeScores(row.projectType, row.city, row.country);
    row.scores = scores as unknown as Record<string, unknown>;
    row.opportunityScore = scores.opportunityScore;
    row.recommendation = this.recommend(scores.opportunityScore);
    row.governanceStatus = this.governanceStatus(scores.opportunityScore);
    return this.screenings.save(row);
  }
}
