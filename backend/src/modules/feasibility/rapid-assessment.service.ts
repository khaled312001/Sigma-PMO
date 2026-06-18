import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GovernanceStatus } from '../../common/enums';
import { currentCompanyId } from '../../common/tenant/tenant-context';
import { FeasibilityAssessment, InvestmentOpportunity } from '../canonical/entities';
import {
  ASSUMPTION_LIBRARY_VERSION,
  PROJECT_TYPE_ASSUMPTIONS,
  PROJECT_TYPES,
  resolveLocationFactor,
} from './assumption-library';
import { FinancialModelService, ModelOutput } from './financial-model.service';

/**
 * RapidAssessmentService — Level 1 of the Investment & Feasibility
 * Intelligence capability: from a handful of inputs (project type, location,
 * investment size, funding structure, objective) produce a deterministic
 * initial assessment — preliminary feasibility, CAPEX/OPEX, revenue, NPV,
 * IRR, payback, risk rating and a governance recommendation
 * (Proceed / Proceed with Conditions / Hold / Reject).
 *
 * Everything is computed from the versioned assumption library + standard
 * finance math and snapshotted append-only; the recommendation ladder is
 * explainable rule-by-rule (each fired rule lands in `results.conditions` /
 * `results.riskFactors`).
 */
@Injectable()
export class RapidAssessmentService {
  constructor(
    @InjectRepository(InvestmentOpportunity)
    private readonly opportunities: Repository<InvestmentOpportunity>,
    @InjectRepository(FeasibilityAssessment)
    private readonly assessments: Repository<FeasibilityAssessment>,
    private readonly model: FinancialModelService,
  ) {}

  async assess(opportunityId: string, createdBy?: string | null): Promise<FeasibilityAssessment> {
    const opp = await this.opportunities.findOne({ where: { id: opportunityId } });
    if (!opp) throw new NotFoundException(`Opportunity ${opportunityId} not found`);

    const assumptions = PROJECT_TYPE_ASSUMPTIONS[opp.projectType];
    if (!assumptions) {
      throw new BadRequestException(
        `Unknown projectType "${opp.projectType}". Known: ${PROJECT_TYPES.join(', ')}`,
      );
    }
    const location = resolveLocationFactor(opp.city, opp.country);

    // ── Resolve CAPEX: explicit figure wins; else derive from built-up area ──
    const inputs = opp.inputs ?? {};
    const bua = numberOf(inputs.builtUpAreaSqm);
    let capex = opp.estimatedInvestment ? Number(opp.estimatedInvestment) : 0;
    let capexBasis = 'investor-estimate';
    if (!(capex > 0)) {
      if (bua && assumptions.costPerSqmBua > 0) {
        capex = bua * assumptions.costPerSqmBua * location.costFactor;
        capexBasis = `derived: ${bua} m² BUA × ${assumptions.costPerSqmBua} × location ${location.costFactor}`;
      } else {
        throw new BadRequestException(
          'No investment size available: provide estimatedInvestment, or a builtUpAreaSqm input (e.g. from a confirmed concept sketch).',
        );
      }
    }

    // ── Funding structure (defaults: 40/60 equity/debt @ 6% / 15y) ──
    const fs = opp.fundingStructure ?? {};
    const equityPct = clamp01(numberOf(fs.equityPct) ?? 0.4);
    const debtPct = clamp01(numberOf(fs.debtPct) ?? 1 - equityPct);
    const interestRatePct = numberOf(fs.interestRatePct) ?? 0.06;
    const tenorYears = numberOf(fs.tenorYears) ?? 15;

    const out = this.model.build({
      capex,
      equityPct,
      debtPct,
      interestRatePct,
      tenorYears,
      assumptions,
      location,
    });

    // ── Deterministic risk rating (each factor named, 0–10 scale) ──
    const riskFactors: string[] = [];
    let riskScore = 0;
    riskScore += location.countryRisk;
    if (location.countryRisk >= 3) riskFactors.push(`country/regulatory risk ${location.countryRisk}/5`);
    riskScore += assumptions.sectorRiskScore * 0.8;
    if (assumptions.sectorRiskScore >= 3) riskFactors.push(`sector volatility ${assumptions.sectorRiskScore}/5`);
    if (debtPct > 0.7) { riskScore += 2; riskFactors.push(`high leverage ${(debtPct * 100).toFixed(0)}%`); }
    else if (debtPct > 0.55) { riskScore += 1; riskFactors.push(`moderate leverage ${(debtPct * 100).toFixed(0)}%`); }
    if (out.dscr.min !== null && out.dscr.min < 1.2) { riskScore += 1.5; riskFactors.push(`thin debt cover (min DSCR ${out.dscr.min})`); }
    if (location.marketStrength <= 2) { riskScore += 1; riskFactors.push(`thin market depth ${location.marketStrength}/5`); }
    const riskRating =
      riskScore >= 7 ? 'high' : riskScore >= 5 ? 'elevated' : riskScore >= 3 ? 'moderate' : 'low';

    // ── Recommendation ladder (explainable, worst condition wins) ──
    const irr = out.projectIrr ?? -1;
    const hurdle = assumptions.hurdleIrrPct;
    const conditions: string[] = [];
    let recommendation: string;
    if (out.npv <= 0 || irr < assumptions.discountRatePct || (out.dscr.min !== null && out.dscr.min < 1.0)) {
      recommendation = 'reject';
      if (out.npv <= 0) conditions.push('NPV is not positive at the reference discount rate');
      if (irr < assumptions.discountRatePct) conditions.push(`IRR ${pct(irr)} below the discount rate ${pct(assumptions.discountRatePct)}`);
      if (out.dscr.min !== null && out.dscr.min < 1.0) conditions.push(`min DSCR ${out.dscr.min} < 1.00 — debt is not serviceable as structured`);
    } else if (irr < hurdle * 0.85) {
      recommendation = 'hold';
      conditions.push(`IRR ${pct(irr)} is materially below the ${pct(hurdle)} hurdle — revisit scope, cost or funding mix`);
    } else if (irr < hurdle || (out.dscr.min !== null && out.dscr.min < 1.2) || riskRating === 'high' || riskRating === 'elevated') {
      recommendation = 'proceed_with_conditions';
      if (irr < hurdle) conditions.push(`lift IRR ${pct(irr)} to the ${pct(hurdle)} hurdle (value engineering / phasing)`);
      if (out.dscr.min !== null && out.dscr.min < 1.2) conditions.push(`restructure debt: min DSCR ${out.dscr.min} below the 1.20 bankability floor`);
      if (riskRating === 'high' || riskRating === 'elevated') conditions.push(`mitigate: ${riskFactors.join('; ')}`);
    } else {
      recommendation = 'proceed';
    }

    const governanceStatus =
      recommendation === 'proceed' ? GovernanceStatus.GREEN
      : recommendation === 'proceed_with_conditions' ? GovernanceStatus.YELLOW
      : recommendation === 'hold' ? GovernanceStatus.ORANGE
      : GovernanceStatus.RED;

    // ── Input-completeness confidence (deterministic) ──
    const provided = [
      opp.estimatedInvestment, opp.city ?? opp.country, opp.businessObjective,
      fs.equityPct, fs.interestRatePct, fs.tenorYears,
      inputs.builtUpAreaSqm, inputs.plotAreaSqm,
    ].filter((v) => v !== null && v !== undefined && v !== '').length;
    const confidence = Math.round((0.45 + 0.55 * (provided / 8)) * 100) / 100;

    // ── Attractiveness score 0–100 (weighted, documented) ──
    const attractivenessScore = attractiveness(out, hurdle, riskScore);

    const assessment = this.assessments.create({
      companyId: currentCompanyId(),
      opportunityId: opp.id,
      level: 1,
      inputs: {
        capex: Math.round(capex * 100) / 100,
        capexBasis,
        equityPct, debtPct, interestRatePct, tenorYears,
        projectType: opp.projectType,
        city: opp.city, country: opp.country,
        structured: inputs,
      },
      assumptions: {
        libraryVersion: ASSUMPTION_LIBRARY_VERSION,
        projectType: opp.projectType,
        values: assumptions,
        location,
      },
      results: {
        ...out,
        attractivenessScore,
        riskScore: Math.round(riskScore * 10) / 10,
        riskFactors,
        conditions,
        hurdleIrrPct: hurdle,
      },
      riskRating,
      recommendation,
      governanceStatus,
      confidence,
      narrative: null,
      createdBy: createdBy ?? null,
    });
    const saved = await this.assessments.save(assessment);

    if (opp.stage === 'idea') {
      opp.stage = 'assessed';
      await this.opportunities.save(opp);
    }
    return saved;
  }

  async history(opportunityId: string, limit = 20): Promise<FeasibilityAssessment[]> {
    return this.assessments.find({
      where: { opportunityId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 100),
    });
  }

  async latest(opportunityId: string): Promise<FeasibilityAssessment | null> {
    const rows = await this.history(opportunityId, 1);
    return rows[0] ?? null;
  }
}

/** 0–100: IRR margin (40) + NPV yield (25) + payback speed (20) + risk (15). */
function attractiveness(out: ModelOutput, hurdle: number, riskScore: number): number {
  const irr = out.projectIrr ?? 0;
  const irrPts = Math.max(0, Math.min(40, ((irr - hurdle) / hurdle) * 80 + 20));
  const npvYield = out.npv / Math.max(1, out.debtAmount + out.equityAmount);
  const npvPts = Math.max(0, Math.min(25, npvYield * 50));
  const horizon = out.years.length;
  const paybackPts = out.paybackYears === null
    ? 0
    : Math.max(0, Math.min(20, (1 - out.paybackYears / horizon) * 25));
  const riskPts = Math.max(0, Math.min(15, 15 - riskScore * 1.5));
  return Math.round(irrPts + npvPts + paybackPts + riskPts);
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
const numberOf = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};
