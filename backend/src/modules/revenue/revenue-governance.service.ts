import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FeasibilityAssessment } from '../canonical/entities';
import { FinancialModelService } from '../feasibility/financial-model.service';
import { ProjectTypeAssumptions, LocationFactor } from '../feasibility/assumption-library';
import { TraceabilityService } from '../quantity-survey/traceability.service';

/**
 * RevenueGovernanceService — Revenue Governance (Mr. Ayham, 2026-06-12
 * follow-up). Completes the move from Project Governance to Investment
 * Governance: it governs what is EARNED, not only what is spent. It validates
 * the revenue + cash-flow lifecycle chains (reusing the traceability ledger)
 * and, crucially, computes the IMPACT of revenue deviations on NPV / IRR /
 * Payback by re-running the deterministic feasibility model — then frames an
 * executive recommendation. Pure deterministic; no AI.
 */
@Injectable()
export class RevenueGovernanceService {
  private readonly logger = new Logger(RevenueGovernanceService.name);

  constructor(
    @InjectRepository(FeasibilityAssessment) private readonly assessments: Repository<FeasibilityAssessment>,
    private readonly traceability: TraceabilityService,
    private readonly model: FinancialModelService,
  ) {}

  /** Validate the revenue + cash-flow chains and persist chain-variance findings. */
  async validate(projectKey: string) {
    return this.traceability.validate(projectKey, ['revenue', 'cashflow']);
  }

  /**
   * Revenue → NPV/IRR impact. Takes the project's revenue chain (rev_forecast
   * vs the latest actual/reforecast), derives the revenue ratio, and re-runs
   * the feasibility model with revenue scaled by that ratio to quantify the
   * impact on NPV, IRR and Payback. Honest fallback when no revenue actuals or
   * no feasibility assessment exist.
   */
  async impact(projectKey: string, opportunityId?: string, subjectKey = 'project'): Promise<{
    projectKey: string;
    revenue: { forecast: number | null; latest: number | null; latestStage: string | null; ratio: number | null };
    base: { npv: number | null; projectIrr: number | null; paybackYears: number | null } | null;
    adjusted: { npv: number | null; projectIrr: number | null; paybackYears: number | null } | null;
    impact: { deltaNpv: number | null; deltaIrrPct: number | null; deltaPaybackYears: number | null } | null;
    recommendation: string;
    basis: string;
  }> {
    // 1) Revenue ratio from the chain.
    const chain = await this.traceability.chain(projectKey, 'revenue', subjectKey);
    const stageVal = (stage: string): number | null => chain.stages.find((s) => s.stage === stage)?.value ?? null;
    const forecast = stageVal('rev_forecast');
    const latestStage = [...chain.stages].reverse().find((s) => s.recorded && s.stage !== 'rev_forecast');
    const latest = latestStage?.value ?? null;
    const ratio = forecast && forecast > 0 && latest !== null ? round4(latest / forecast) : null;

    // 2) Base feasibility model.
    const assessment = opportunityId
      ? await this.assessments.findOne({ where: { opportunityId, isCurrent: true } as never, order: { createdAt: 'DESC' } })
      : await this.assessments.findOne({ where: {}, order: { createdAt: 'DESC' } });

    if (!assessment) {
      return {
        projectKey,
        revenue: { forecast, latest, latestStage: latestStage?.stage ?? null, ratio },
        base: null, adjusted: null, impact: null,
        recommendation: ratio === null
          ? 'Record a revenue forecast and at least one actual/reforecast to assess revenue governance.'
          : `Revenue is tracking at ${(ratio * 100).toFixed(0)}% of forecast. Link a feasibility assessment to quantify the NPV/IRR impact.`,
        basis: 'no feasibility assessment available to re-run the model',
      };
    }

    const r = assessment.results as Record<string, number>;
    const base = { npv: numOrNull(r.npv), projectIrr: numOrNull(r.projectIrr), paybackYears: numOrNull(r.paybackYears) };

    if (ratio === null) {
      return {
        projectKey,
        revenue: { forecast, latest, latestStage: latestStage?.stage ?? null, ratio },
        base, adjusted: null, impact: null,
        recommendation: 'Record actual/reforecast revenue to compute the NPV/IRR impact against the forecast.',
        basis: 'revenue ratio unavailable (need forecast + an actual/reforecast)',
      };
    }

    // 3) Re-run the model with revenue scaled by the ratio.
    const inputs = assessment.inputs as Record<string, number>;
    const assumptions = (assessment.assumptions as { values: ProjectTypeAssumptions }).values;
    const location = (assessment.assumptions as { location: LocationFactor }).location;
    const adjustedAssumptions: ProjectTypeAssumptions = {
      ...assumptions,
      annualRevenueYieldPct: assumptions.annualRevenueYieldPct * ratio,
    };
    const out = this.model.build({
      capex: Number(inputs.capex),
      equityPct: Number(inputs.equityPct),
      debtPct: Number(inputs.debtPct),
      interestRatePct: Number(inputs.interestRatePct),
      tenorYears: Number(inputs.tenorYears),
      assumptions: adjustedAssumptions,
      location,
    });
    const adjusted = { npv: out.npv, projectIrr: out.projectIrr, paybackYears: out.paybackYears };
    const impact = {
      deltaNpv: base.npv !== null ? round2(adjusted.npv - base.npv) : null,
      deltaIrrPct: base.projectIrr !== null && adjusted.projectIrr !== null ? round4(adjusted.projectIrr - base.projectIrr) : null,
      deltaPaybackYears: base.paybackYears !== null && adjusted.paybackYears !== null ? round2(adjusted.paybackYears - base.paybackYears) : null,
    };

    const down = ratio < 1;
    const recommendation = Math.abs(ratio - 1) < 0.02
      ? 'Revenue is on plan — no NPV/IRR impact; maintain monitoring.'
      : `Revenue at ${(ratio * 100).toFixed(0)}% of forecast ${down ? 'reduces' : 'improves'} NPV by ${impact.deltaNpv !== null ? `${Math.abs(impact.deltaNpv / 1_000_000).toFixed(2)}M` : '—'} and IRR by ${impact.deltaIrrPct !== null ? `${Math.abs(impact.deltaIrrPct * 100).toFixed(1)}pts` : '—'}. ` +
        (down ? 'Escalate to the investment committee: review pricing/absorption, collections and the funding model.' : 'Upside — confirm sustainability before re-baselining the business case.');

    this.logger.log(`Revenue impact for ${projectKey}: ratio ${ratio}, ΔNPV ${impact.deltaNpv}, ΔIRR ${impact.deltaIrrPct}.`);
    return {
      projectKey,
      revenue: { forecast, latest, latestStage: latestStage?.stage ?? null, ratio },
      base, adjusted, impact,
      recommendation,
      basis: 'feasibility model re-run with annualRevenueYieldPct × revenue ratio (deterministic)',
    };
  }
}

const numOrNull = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? n : null);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
