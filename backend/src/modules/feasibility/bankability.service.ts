import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  FeasibilityAssessment,
  FeasibilityStudySection,
  InvestmentOpportunity,
} from '../canonical/entities';
import { ProjectTypeAssumptions, LocationFactor } from './assumption-library';
import { FinancialModelService, ModelOutput } from './financial-model.service';
import { RapidAssessmentService } from './rapid-assessment.service';

/**
 * BankabilityService — Level 2 of the Investment & Feasibility Intelligence
 * capability: the professional feasibility & bankability engine. From the
 * latest deterministic model run it progressively generates the full study —
 * the 17 sections Mr. Ayham listed (Executive Summary → Governance
 * Recommendation) — and composes them into audience packages (Investor /
 * Partner / Bank).
 *
 * Sections are versioned append-only (regenerate = version+1, old rows keep
 * `isCurrent=false`), each carries `source: deterministic` provenance, and an
 * explicit human `approve` gate stands between generation and inclusion in a
 * package marked approved.
 */

export const STUDY_SECTIONS: Array<{ key: string; title: string }> = [
  { key: 'executive_summary', title: 'Executive Summary' },
  { key: 'market_assessment', title: 'Market Assessment' },
  { key: 'technical_feasibility', title: 'Technical Feasibility' },
  { key: 'operational_model', title: 'Operational Model' },
  { key: 'capex_opex', title: 'CAPEX & OPEX Analysis' },
  { key: 'revenue_forecast', title: 'Revenue Forecasts' },
  { key: 'cash_flow', title: 'Cash Flow Forecasts' },
  { key: 'financial_statements', title: 'Financial Statements' },
  { key: 'npv_analysis', title: 'NPV Analysis' },
  { key: 'irr_analysis', title: 'IRR Analysis' },
  { key: 'payback', title: 'Payback Period' },
  { key: 'dscr_analysis', title: 'DSCR Analysis' },
  { key: 'sensitivity_analysis', title: 'Sensitivity Analysis' },
  { key: 'risk_assessment', title: 'Risk Assessment' },
  { key: 'funding_requirements', title: 'Funding Requirements' },
  { key: 'bankability', title: 'Bankability Assessment' },
  { key: 'governance_recommendation', title: 'Governance Recommendation' },
];

/** Audience → ordered section subset (the package composition). */
export const PACKAGE_SECTIONS: Record<string, string[]> = {
  investor: [
    'executive_summary', 'market_assessment', 'operational_model', 'revenue_forecast',
    'cash_flow', 'npv_analysis', 'irr_analysis', 'payback', 'sensitivity_analysis',
    'risk_assessment', 'governance_recommendation',
  ],
  partner: [
    'executive_summary', 'market_assessment', 'technical_feasibility', 'operational_model',
    'capex_opex', 'revenue_forecast', 'risk_assessment', 'governance_recommendation',
  ],
  bank: [
    'executive_summary', 'capex_opex', 'cash_flow', 'financial_statements', 'dscr_analysis',
    'sensitivity_analysis', 'funding_requirements', 'bankability', 'risk_assessment',
    'governance_recommendation',
  ],
};

/** The model output as the assessment snapshots it (model + ladder extras). */
type AssessedResults = ModelOutput & {
  conditions: string[];
  riskFactors: string[];
  attractivenessScore: number;
  riskScore: number;
  hurdleIrrPct: number;
};

interface StudyContext {
  opp: InvestmentOpportunity;
  assessment: FeasibilityAssessment;
  out: AssessedResults;
  assumptions: ProjectTypeAssumptions;
  location: LocationFactor;
  capex: number;
  currency: string;
  sensitivity: Array<{ scenario: string; npv: number; irr: number | null }>;
}

@Injectable()
export class BankabilityService {
  constructor(
    @InjectRepository(InvestmentOpportunity)
    private readonly opportunities: Repository<InvestmentOpportunity>,
    @InjectRepository(FeasibilityStudySection)
    private readonly sections: Repository<FeasibilityStudySection>,
    private readonly rapid: RapidAssessmentService,
    private readonly model: FinancialModelService,
  ) {}

  /** Generate (or regenerate) the full 17-section study from the latest run. */
  async generateStudy(opportunityId: string, createdBy?: string | null): Promise<FeasibilityStudySection[]> {
    const opp = await this.opportunities.findOne({ where: { id: opportunityId } });
    if (!opp) throw new NotFoundException(`Opportunity ${opportunityId} not found`);

    let assessment = await this.rapid.latest(opportunityId);
    if (!assessment) assessment = await this.rapid.assess(opportunityId, createdBy ?? 'study-engine');

    const ctx = this.buildContext(opp, assessment);

    // Versioning: flip current rows, insert the new generation.
    const current = await this.sections.find({ where: { opportunityId, isCurrent: true } });
    const nextVersion = current.length ? Math.max(...current.map((s) => s.version)) + 1 : 1;
    for (const row of current) {
      row.isCurrent = false;
      await this.sections.save(row);
    }

    const rows: FeasibilityStudySection[] = [];
    for (const def of STUDY_SECTIONS) {
      const { content, data } = this.renderSection(def.key, ctx);
      rows.push(
        await this.sections.save(
          this.sections.create({
            opportunityId,
            sectionKey: def.key,
            title: def.title,
            content,
            data,
            version: nextVersion,
            isCurrent: true,
            status: 'generated',
            source: 'deterministic',
            approvedBy: null,
          }),
        ),
      );
    }

    if (opp.stage === 'idea' || opp.stage === 'assessed') {
      opp.stage = 'study';
      await this.opportunities.save(opp);
    }
    return rows;
  }

  async getStudy(opportunityId: string): Promise<FeasibilityStudySection[]> {
    const rows = await this.sections.find({ where: { opportunityId, isCurrent: true } });
    const order = new Map(STUDY_SECTIONS.map((s, i) => [s.key, i]));
    return rows.sort((a, b) => (order.get(a.sectionKey) ?? 99) - (order.get(b.sectionKey) ?? 99));
  }

  async approveSection(opportunityId: string, sectionKey: string, approvedBy: string | null): Promise<FeasibilityStudySection> {
    const row = await this.sections.findOne({ where: { opportunityId, sectionKey, isCurrent: true } });
    if (!row) throw new NotFoundException(`Section ${sectionKey} not found for ${opportunityId} — generate the study first`);
    row.status = 'approved';
    row.approvedBy = approvedBy;
    return this.sections.save(row);
  }

  /** Compose an audience package from the current sections. */
  async composePackage(opportunityId: string, audience: string): Promise<{
    audience: string;
    opportunity: { code: string; title: string; projectType: string; city: string | null; country: string | null; currency: string };
    generatedSections: number;
    approvedSections: number;
    sections: FeasibilityStudySection[];
  }> {
    const keys = PACKAGE_SECTIONS[audience];
    if (!keys) {
      throw new BadRequestException(
        `Unknown audience "${audience}". Known: ${Object.keys(PACKAGE_SECTIONS).join(', ')}`,
      );
    }
    const opp = await this.opportunities.findOne({ where: { id: opportunityId } });
    if (!opp) throw new NotFoundException(`Opportunity ${opportunityId} not found`);
    const all = await this.getStudy(opportunityId);
    if (!all.length) throw new BadRequestException('No study generated yet — run study generation first');
    const byKey = new Map(all.map((s) => [s.sectionKey, s]));
    const sections = keys.map((k) => byKey.get(k)).filter((s): s is FeasibilityStudySection => !!s);
    return {
      audience,
      opportunity: {
        code: opp.code, title: opp.title, projectType: opp.projectType,
        city: opp.city, country: opp.country, currency: opp.currency,
      },
      generatedSections: sections.length,
      approvedSections: sections.filter((s) => s.status === 'approved').length,
      sections,
    };
  }

  // ───────────────────────── section generators ─────────────────────────

  private buildContext(opp: InvestmentOpportunity, assessment: FeasibilityAssessment): StudyContext {
    const out = assessment.results as unknown as AssessedResults;
    const assumptions = (assessment.assumptions as { values: ProjectTypeAssumptions }).values;
    const location = (assessment.assumptions as { location: LocationFactor }).location;
    const inputs = assessment.inputs as Record<string, number>;
    const capex = Number(inputs.capex);

    // Deterministic sensitivity grid recomputed from the snapshotted inputs.
    const base = {
      capex,
      equityPct: Number(inputs.equityPct),
      debtPct: Number(inputs.debtPct),
      interestRatePct: Number(inputs.interestRatePct),
      tenorYears: Number(inputs.tenorYears),
      assumptions,
      location,
    };
    const scenarios: Array<{ scenario: string; npv: number; irr: number | null }> = [];
    const run = (label: string, mutate: (b: typeof base) => typeof base) => {
      const m = this.model.build(mutate({ ...base, assumptions: { ...assumptions }, location: { ...location } }));
      scenarios.push({ scenario: label, npv: m.npv, irr: m.projectIrr });
    };
    run('Base case', (b) => b);
    run('CAPEX +10%', (b) => ({ ...b, capex: b.capex * 1.1 }));
    run('CAPEX −10%', (b) => ({ ...b, capex: b.capex * 0.9 }));
    run('Revenue −10%', (b) => ({ ...b, assumptions: { ...b.assumptions, annualRevenueYieldPct: b.assumptions.annualRevenueYieldPct * 0.9 } }));
    run('Revenue +10%', (b) => ({ ...b, assumptions: { ...b.assumptions, annualRevenueYieldPct: b.assumptions.annualRevenueYieldPct * 1.1 } }));
    run('Interest +200bps', (b) => ({ ...b, interestRatePct: b.interestRatePct + 0.02 }));

    return { opp, assessment, out, assumptions, location, capex, currency: opp.currency, sensitivity: scenarios };
  }

  private renderSection(key: string, ctx: StudyContext): { content: string; data: Record<string, unknown> | null } {
    const { opp, out, assumptions, location, capex, currency: cur, assessment } = ctx;
    const m = (n: number | null | undefined): string =>
      n === null || n === undefined ? '—' : `${cur} ${(n / 1_000_000).toFixed(2)}M`;
    const p = (n: number | null | undefined): string =>
      n === null || n === undefined ? '—' : `${(n * 100).toFixed(1)}%`;
    const rec = String(assessment.recommendation).replace(/_/g, ' ');

    switch (key) {
      case 'executive_summary':
        return {
          content:
            `**${opp.title}** (${opp.code}) — ${assumptions.label} in ${opp.city ?? opp.country ?? 'TBD'}.\n\n` +
            `Total investment ${m(capex)}, funded ${p(Number((assessment.inputs as Record<string, unknown>).equityPct))} equity / ` +
            `${p(Number((assessment.inputs as Record<string, unknown>).debtPct))} debt. The deterministic model projects stabilized revenue of ` +
            `${m(out.stabilizedRevenue)}/yr and EBITDA of ${m(out.stabilizedEbitda)}/yr over a ${assumptions.horizonYears}-year horizon ` +
            `after ${assumptions.constructionYears} construction year(s).\n\n` +
            `Headline results: **NPV ${m(out.npv)}** at ${p(assumptions.discountRatePct)} discount, ` +
            `**project IRR ${p(out.projectIrr)}** vs a ${p(assumptions.hurdleIrrPct)} hurdle, payback ` +
            `${out.paybackYears ?? '—'} years, minimum DSCR ${out.dscr.min ?? '—'}. Risk rating: **${assessment.riskRating}**.\n\n` +
            `Governance recommendation: **${rec.toUpperCase()}**${ctx.out.conditions?.length ? ` — conditions: ${ctx.out.conditions.join('; ')}` : ''}.\n\n` +
            `Business objective: ${opp.businessObjective ?? '—'}`,
          data: {
            kpis: {
              capex, npv: out.npv, projectIrr: out.projectIrr, equityIrr: out.equityIrr,
              paybackYears: out.paybackYears, minDscr: out.dscr.min,
              recommendation: assessment.recommendation, riskRating: assessment.riskRating,
              attractivenessScore: ctx.out.attractivenessScore,
            },
          },
        };

      case 'market_assessment':
        return {
          content:
            `Location factors for ${opp.city ?? opp.country ?? 'the target market'} (Sigma reference set):\n\n` +
            `- Market depth/strength: **${location.marketStrength}/5** — drives a ${p(0.9 + location.marketStrength * 0.04 - 1)} revenue adjustment vs benchmark.\n` +
            `- Country/regulatory risk: **${location.countryRisk}/5**.\n` +
            `- Construction cost factor vs UAE benchmark: **×${location.costFactor}**.\n\n` +
            `Sector profile (${assumptions.label}): stabilized revenue yield ${p(assumptions.annualRevenueYieldPct)} of CAPEX/yr, ` +
            `sector volatility ${assumptions.sectorRiskScore}/5, demand ramp-up reaching stabilization in ${assumptions.rampUp.length} operating year(s).`,
          data: { location, sector: { label: assumptions.label, yield: assumptions.annualRevenueYieldPct, risk: assumptions.sectorRiskScore } },
        };

      case 'technical_feasibility': {
        const i = opp.inputs ?? {};
        return {
          content:
            `Concept parameters captured for the asset:\n\n` +
            `- Plot area: ${i.plotAreaSqm ?? '—'} m²\n` +
            `- Built-up area (BUA): ${i.builtUpAreaSqm ?? '—'} m²\n` +
            `- Floors: ${i.floors ?? '—'}\n` +
            `- Functional zones: ${Array.isArray(i.functionalZones) ? (i.functionalZones as string[]).join(', ') : '—'}\n` +
            `- Unit mix: ${i.unitMix ? JSON.stringify(i.unitMix) : '—'}\n` +
            `- Capacity: ${i.capacity ?? '—'}\n\n` +
            `Reference development cost: ${assumptions.costPerSqmBua > 0 ? `${cur} ${assumptions.costPerSqmBua}/m² BUA × location factor ${location.costFactor}` : 'CAPEX-driven (not area-based)'} ` +
            `over ${assumptions.constructionYears} construction year(s). CAPEX basis: ${(assessment.inputs as Record<string, unknown>).capexBasis}.`,
          data: { conceptInputs: i },
        };
      }

      case 'operational_model':
        return {
          content:
            `Operating assumptions (${assumptions.label}):\n\n` +
            `- Operating cost ratio: ${p(assumptions.opexPctOfRevenue)} of revenue → stabilized EBITDA margin ${p(1 - assumptions.opexPctOfRevenue)}.\n` +
            `- Ramp-up: ${assumptions.rampUp.map((r, i2) => `Y${i2 + 1} ${p(r)}`).join(' · ')} then 100%.\n` +
            `- Horizon: ${assumptions.horizonYears} operating years; terminal value at ${assumptions.terminalValueMultiple}× stabilized EBITDA.\n\n` +
            `Stabilized P&L: revenue ${m(out.stabilizedRevenue)}/yr − OPEX ${m(out.stabilizedRevenue - out.stabilizedEbitda)}/yr = EBITDA ${m(out.stabilizedEbitda)}/yr.`,
          data: { rampUp: assumptions.rampUp, opexPct: assumptions.opexPctOfRevenue, horizonYears: assumptions.horizonYears },
        };

      case 'capex_opex':
        return {
          content:
            `CAPEX envelope ${m(capex)} split per the Sigma benchmark:\n\n` +
            `| Component | Amount | Share |\n|---|---|---|\n` +
            `| Land | ${m(out.capexBreakdown.land)} | ${p(assumptions.capexSplit.land)} |\n` +
            `| Construction | ${m(out.capexBreakdown.construction)} | ${p(assumptions.capexSplit.construction)} |\n` +
            `| Soft costs | ${m(out.capexBreakdown.softCosts)} | ${p(assumptions.capexSplit.softCosts)} |\n` +
            `| Contingency | ${m(out.capexBreakdown.contingency)} | ${p(assumptions.capexSplit.contingency)} |\n\n` +
            `Annual OPEX at stabilization: ${m(out.stabilizedRevenue - out.stabilizedEbitda)} (${p(assumptions.opexPctOfRevenue)} of revenue).`,
          data: { capexBreakdown: out.capexBreakdown, opexAnnual: out.stabilizedRevenue - out.stabilizedEbitda },
        };

      case 'revenue_forecast':
        return {
          content:
            `Revenue builds from ${p(assumptions.annualRevenueYieldPct)} yield on CAPEX, adjusted ×${(0.9 + location.marketStrength * 0.04).toFixed(2)} ` +
            `for market strength, ramping to stabilization at ${m(out.stabilizedRevenue)}/yr:\n\n` +
            this.yearTable(ctx, ['revenue', 'opex', 'ebitda']),
          data: { years: out.years.map(({ year, phase, revenue, opex, ebitda }) => ({ year, phase, revenue, opex, ebitda })) },
        };

      case 'cash_flow':
        return {
          content:
            `Unlevered project cash flows (CAPEX spread over construction, terminal value in the final year):\n\n` +
            this.yearTable(ctx, ['capexOutflow', 'projectCashflow', 'cumulativeProjectCashflow']),
          data: { years: out.years },
        };

      case 'financial_statements': {
        const statements = this.financialStatements(ctx);
        return {
          content:
            `Simplified pro-forma statements (depreciation straight-line on construction cost over the horizon; ` +
            `corporate tax ${p(assumptions.taxRatePct)}; interest from the amortization schedule):\n\n` +
            `| Year | Revenue | EBITDA | Depreciation | Interest | PBT | Tax | Net profit |\n|---|---|---|---|---|---|---|---|\n` +
            statements.map((r) => `| ${r.year} | ${m(r.revenue)} | ${m(r.ebitda)} | ${m(r.depreciation)} | ${m(r.interest)} | ${m(r.pbt)} | ${m(r.tax)} | ${m(r.netProfit)} |`).join('\n'),
          data: { statements },
        };
      }

      case 'npv_analysis':
        return {
          content:
            `NPV at the ${p(assumptions.discountRatePct)} reference discount rate: **${m(out.npv)}**.\n\n` +
            `The project ${out.npv > 0 ? 'creates' : 'destroys'} value at the reference cost of capital: every dirham of the ` +
            `${m(capex)} envelope returns ${(1 + out.npv / capex).toFixed(2)} in present-value terms. ` +
            `Terminal value contributes ${m(out.terminalValue)} (year ${out.years.length}).`,
          data: { npv: out.npv, discountRate: assumptions.discountRatePct, terminalValue: out.terminalValue },
        };

      case 'irr_analysis':
        return {
          content:
            `Project IRR (unlevered): **${p(out.projectIrr)}** vs hurdle ${p(assumptions.hurdleIrrPct)} → margin ` +
            `${out.projectIrr !== null ? p(out.projectIrr - assumptions.hurdleIrrPct) : '—'}.\n\n` +
            `Equity IRR (levered, after ${p(Number((assessment.inputs as Record<string, unknown>).interestRatePct))} debt service): **${p(out.equityIrr)}** — ` +
            `${out.equityIrr !== null && out.projectIrr !== null && out.equityIrr > out.projectIrr ? 'leverage is accretive at this pricing.' : 'leverage does not improve equity returns at this pricing.'}`,
          data: { projectIrr: out.projectIrr, equityIrr: out.equityIrr, hurdle: assumptions.hurdleIrrPct },
        };

      case 'payback':
        return {
          content:
            `Cumulative project cash flow turns positive after **${out.paybackYears ?? '— (beyond horizon)'} years** ` +
            `(undiscounted, from project start, including ${assumptions.constructionYears} construction year(s)).`,
          data: { paybackYears: out.paybackYears },
        };

      case 'dscr_analysis':
        return {
          content:
            `Debt ${m(out.debtAmount)} at ${p(Number((assessment.inputs as Record<string, unknown>).interestRatePct))}, ` +
            `${(assessment.inputs as Record<string, unknown>).tenorYears} year annuity of ${m(out.annualDebtService)}/yr.\n\n` +
            `- Minimum DSCR: **${out.dscr.min ?? '—'}** (bankability floor 1.20)\n` +
            `- Average DSCR: **${out.dscr.avg ?? '—'}**\n\n` +
            this.yearTable(ctx, ['ebitda', 'debtService', 'dscr']),
          data: { dscr: out.dscr, annualDebtService: out.annualDebtService, debtAmount: out.debtAmount },
        };

      case 'sensitivity_analysis':
        return {
          content:
            `Deterministic re-runs of the full model:\n\n` +
            `| Scenario | NPV | IRR |\n|---|---|---|\n` +
            ctx.sensitivity.map((s) => `| ${s.scenario} | ${m(s.npv)} | ${p(s.irr)} |`).join('\n') +
            `\n\nBreak points to watch: the deal ${ctx.sensitivity.some((s) => s.npv < 0) ? '**turns NPV-negative** under ' + ctx.sensitivity.filter((s) => s.npv < 0).map((s) => s.scenario).join(', ') : 'stays NPV-positive across all tested scenarios'}.`,
          data: { scenarios: ctx.sensitivity },
        };

      case 'risk_assessment':
        return {
          content:
            `Risk rating: **${assessment.riskRating}** (score ${ctx.out.riskScore}/10).\n\n` +
            (ctx.out.riskFactors?.length
              ? `Named factors:\n${ctx.out.riskFactors.map((f: string) => `- ${f}`).join('\n')}`
              : 'No elevated factors fired — leverage, market depth, sector volatility and country risk are all within reference bands.'),
          data: { riskRating: assessment.riskRating, riskScore: ctx.out.riskScore, riskFactors: ctx.out.riskFactors },
        };

      case 'funding_requirements':
        return {
          content:
            `Sources & uses for the ${m(capex)} envelope:\n\n` +
            `| Sources | Amount | | Uses | Amount |\n|---|---|---|---|---|\n` +
            `| Equity | ${m(out.equityAmount)} | | Land | ${m(out.capexBreakdown.land)} |\n` +
            `| Debt | ${m(out.debtAmount)} | | Construction | ${m(out.capexBreakdown.construction)} |\n` +
            `| | | | Soft costs | ${m(out.capexBreakdown.softCosts)} |\n` +
            `| | | | Contingency | ${m(out.capexBreakdown.contingency)} |\n\n` +
            `Equity is drawn pro-rata with construction; the facility amortizes as a ` +
            `${(assessment.inputs as Record<string, unknown>).tenorYears}-year annuity from first operations.`,
          data: { sources: { equity: out.equityAmount, debt: out.debtAmount }, uses: out.capexBreakdown },
        };

      case 'bankability': {
        const checks = [
          { check: 'Min DSCR ≥ 1.20', pass: out.dscr.min !== null && out.dscr.min >= 1.2, value: String(out.dscr.min ?? '—') },
          { check: 'NPV positive at reference discount', pass: out.npv > 0, value: m(out.npv) },
          { check: `Project IRR ≥ hurdle ${p(assumptions.hurdleIrrPct)}`, pass: (out.projectIrr ?? -1) >= assumptions.hurdleIrrPct, value: p(out.projectIrr) },
          { check: 'Leverage ≤ 70%', pass: Number((assessment.inputs as Record<string, unknown>).debtPct) <= 0.7, value: p(Number((assessment.inputs as Record<string, unknown>).debtPct)) },
          { check: 'Payback within horizon', pass: out.paybackYears !== null, value: String(out.paybackYears ?? 'beyond') },
          { check: 'Risk rating ≤ moderate', pass: ['low', 'moderate'].includes(assessment.riskRating), value: assessment.riskRating },
        ];
        const passed = checks.filter((c) => c.pass).length;
        return {
          content:
            `Bankability screen: **${passed}/${checks.length} criteria pass**.\n\n` +
            `| Criterion | Result | Value |\n|---|---|---|\n` +
            checks.map((c) => `| ${c.check} | ${c.pass ? '✅ pass' : '❌ fail'} | ${c.value} |`).join('\n') +
            `\n\n${passed === checks.length ? 'The structure is presentable to financial institutions as-is.' : 'Address the failing criteria before approaching lenders — see Sensitivity and DSCR sections for the levers.'}`,
          data: { checks, passed },
        };
      }

      case 'governance_recommendation':
        return {
          content:
            `**${rec.toUpperCase()}** (governance status: ${assessment.governanceStatus}).\n\n` +
            (ctx.out.conditions?.length
              ? `Conditions / rationale:\n${ctx.out.conditions.map((c: string) => `- ${c}`).join('\n')}`
              : 'All ladder criteria pass: NPV positive, IRR clears the hurdle, debt cover above the bankability floor, risk within appetite.') +
            `\n\nAttractiveness score: **${ctx.out.attractivenessScore}/100**. This recommendation is advisory decision support; ` +
            `the investment decision itself remains with the governance authority.`,
          data: {
            recommendation: assessment.recommendation,
            governanceStatus: assessment.governanceStatus,
            conditions: ctx.out.conditions,
            attractivenessScore: ctx.out.attractivenessScore,
          },
        };

      default:
        return { content: 'Section not implemented.', data: null };
    }
  }

  /** Markdown year table for the selected columns. */
  private yearTable(ctx: StudyContext, cols: Array<keyof StudyContext['out']['years'][number]>): string {
    const m = (n: number | null): string =>
      n === null ? '—' : typeof n === 'number' && Math.abs(n) >= 10000
        ? `${(n / 1_000_000).toFixed(2)}M`
        : String(n);
    const header = `| Year | Phase | ${cols.map(humanize).join(' | ')} |`;
    const sep = `|---|---|${cols.map(() => '---').join('|')}|`;
    const rows = ctx.out.years.map(
      (r) => `| ${r.year} | ${r.phase} | ${cols.map((c) => m(r[c] as number | null)).join(' | ')} |`,
    );
    return [header, sep, ...rows].join('\n');
  }

  /** Pro-forma P&L per operating year with a real amortization schedule. */
  private financialStatements(ctx: StudyContext): Array<{
    year: number; revenue: number; ebitda: number; depreciation: number;
    interest: number; pbt: number; tax: number; netProfit: number;
  }> {
    const { out, assumptions, assessment } = ctx;
    const rate = Number((assessment.inputs as Record<string, unknown>).interestRatePct);
    const depreciation = out.capexBreakdown.construction / assumptions.horizonYears;
    let balance = out.debtAmount;
    const rows: Array<{ year: number; revenue: number; ebitda: number; depreciation: number; interest: number; pbt: number; tax: number; netProfit: number }> = [];
    for (const y of out.years) {
      if (y.phase !== 'operation') continue;
      let interest = 0;
      if (y.debtService > 0 && balance > 0) {
        interest = balance * rate;
        balance = Math.max(0, balance - (y.debtService - interest));
      }
      const isLast = y.year === out.years.length;
      const ebitdaOperating = isLast ? y.ebitda - out.terminalValue : y.ebitda;
      const pbt = ebitdaOperating - depreciation - interest;
      const tax = Math.max(0, pbt * assumptions.taxRatePct);
      rows.push({
        year: y.year,
        revenue: y.revenue,
        ebitda: r2(ebitdaOperating),
        depreciation: r2(depreciation),
        interest: r2(interest),
        pbt: r2(pbt),
        tax: r2(tax),
        netProfit: r2(pbt - tax),
      });
    }
    return rows;
  }
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const humanize = (k: string): string =>
  k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
