import { Injectable } from '@nestjs/common';

import { LocationFactor, ProjectTypeAssumptions } from './assumption-library';

/**
 * FinancialModelService — the pure deterministic investment mathematics:
 * cash-flow projection, NPV, IRR (project + equity), payback, debt service and
 * DSCR. Standard corporate-finance formulas, no AI anywhere in this file —
 * the platform's deterministic-first rule applied to feasibility. The LLM may
 * later *narrate* these numbers; it never computes them.
 */

export interface ModelInput {
  /** Total CAPEX (project currency). */
  capex: number;
  equityPct: number;
  debtPct: number;
  /** Annual nominal interest rate on debt (fraction). */
  interestRatePct: number;
  /** Debt tenor in years (amortizing annuity from first operating year). */
  tenorYears: number;
  assumptions: ProjectTypeAssumptions;
  location: LocationFactor;
}

export interface YearRow {
  year: number;
  phase: 'construction' | 'operation';
  revenue: number;
  opex: number;
  ebitda: number;
  capexOutflow: number;
  debtService: number;
  dscr: number | null;
  /** Unlevered project cash flow (pre-financing). */
  projectCashflow: number;
  /** Levered equity cash flow (post debt draw + service). */
  equityCashflow: number;
  cumulativeProjectCashflow: number;
}

export interface ModelOutput {
  years: YearRow[];
  capexBreakdown: Record<string, number>;
  stabilizedRevenue: number;
  stabilizedEbitda: number;
  terminalValue: number;
  debtAmount: number;
  equityAmount: number;
  annualDebtService: number;
  npv: number;
  projectIrr: number | null;
  equityIrr: number | null;
  paybackYears: number | null;
  dscr: { min: number | null; avg: number | null };
}

@Injectable()
export class FinancialModelService {
  /** NPV of `flows` (flows[0] at t=0) at `rate`. */
  npv(rate: number, flows: number[]): number {
    return flows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);
  }

  /**
   * IRR via bisection on [-0.99, 10]. Returns null when the cash-flow vector
   * has no sign change (no root). Deterministic and total — never NaN.
   */
  irr(flows: number[]): number | null {
    const hasNegative = flows.some((f) => f < 0);
    const hasPositive = flows.some((f) => f > 0);
    if (!hasNegative || !hasPositive) return null;
    let lo = -0.99;
    let hi = 10;
    let fLo = this.npv(lo, flows);
    const fHi = this.npv(hi, flows);
    if (fLo * fHi > 0) return null;
    for (let i = 0; i < 200; i += 1) {
      const mid = (lo + hi) / 2;
      const fMid = this.npv(mid, flows);
      if (Math.abs(fMid) < 1e-9) return round4(mid);
      if (fLo * fMid < 0) {
        hi = mid;
      } else {
        lo = mid;
        fLo = fMid;
      }
    }
    return round4((lo + hi) / 2);
  }

  /** Constant annual payment fully amortizing `principal` over `years` at `rate`. */
  annuity(principal: number, rate: number, years: number): number {
    if (principal <= 0 || years <= 0) return 0;
    if (rate === 0) return principal / years;
    const f = Math.pow(1 + rate, years);
    return (principal * rate * f) / (f - 1);
  }

  /** First (fractional) year cumulative cash flow turns ≥ 0. Null if never. */
  paybackYears(flows: number[]): number | null {
    let cumulative = 0;
    for (let t = 0; t < flows.length; t += 1) {
      const prev = cumulative;
      cumulative += flows[t];
      if (cumulative >= 0 && t > 0) {
        const within = flows[t] === 0 ? 0 : -prev / flows[t];
        return round2(t - 1 + within);
      }
    }
    return null;
  }

  /** Outstanding annuity balance after `k` annual payments. */
  remainingBalance(principal: number, rate: number, years: number, k: number): number {
    if (principal <= 0 || k >= years) return 0;
    if (rate === 0) return principal * (1 - k / years);
    const pay = this.annuity(principal, rate, years);
    const f = Math.pow(1 + rate, k);
    return principal * f - (pay * (f - 1)) / rate;
  }

  /**
   * Build the full year-by-year model. Construction years spread CAPEX evenly;
   * operating years apply the ramp-up curve, the location market-strength
   * revenue adjustment (±10% around neutral 3), and the exit value at the end
   * of the hold period. Debt draws pro-rata with CAPEX; the annuity starts
   * with operations, and any balance still outstanding at exit is repaid out
   * of the final-year equity cash flow (no free balloon).
   */
  build(input: ModelInput): ModelOutput {
    const a = input.assumptions;
    const capex = input.capex;
    const debtAmount = capex * input.debtPct;
    const equityAmount = capex * input.equityPct;
    const annualDebtService = this.annuity(debtAmount, input.interestRatePct, input.tenorYears);

    // Market strength 1..5 → revenue adjustment 0.94..1.10 (neutral 3 → 1.02).
    const revenueAdj = 0.9 + input.location.marketStrength * 0.04;
    const stabilizedRevenue = capex * a.annualRevenueYieldPct * revenueAdj;
    const stabilizedEbitda = stabilizedRevenue * (1 - a.opexPctOfRevenue);
    const terminalValue = stabilizedEbitda * a.terminalValueMultiple;

    const years: YearRow[] = [];
    const totalYears = a.constructionYears + a.horizonYears;
    const capexPerYear = a.constructionYears > 0 ? capex / a.constructionYears : capex;
    let cumulative = 0;

    for (let y = 0; y < totalYears; y += 1) {
      const isConstruction = y < a.constructionYears;
      const opYear = y - a.constructionYears; // 0-based operating year index
      const ramp = isConstruction ? 0 : (a.rampUp[opYear] ?? 1);
      const revenue = isConstruction ? 0 : stabilizedRevenue * Math.min(ramp, 1);
      const opex = revenue * a.opexPctOfRevenue;
      let ebitda = revenue - opex;
      const capexOutflow = isConstruction ? capexPerYear : 0;
      const inTenor = !isConstruction && opYear < input.tenorYears;
      const debtService = inTenor ? annualDebtService : 0;
      const isLastYear = y === totalYears - 1;
      if (isLastYear) ebitda += terminalValue;

      const projectCashflow = ebitda - capexOutflow;
      // Equity view: debt funds its share of construction; equity covers the
      // rest. At exit the outstanding balance is settled from the proceeds.
      const exitBalloon = isLastYear
        ? this.remainingBalance(debtAmount, input.interestRatePct, input.tenorYears, Math.min(opYear + 1, input.tenorYears))
        : 0;
      const equityCashflow = isConstruction
        ? -(capexPerYear * input.equityPct)
        : ebitda - debtService - exitBalloon;
      cumulative += projectCashflow;

      years.push({
        year: y + 1,
        phase: isConstruction ? 'construction' : 'operation',
        revenue: round2(revenue),
        opex: round2(opex),
        ebitda: round2(ebitda),
        capexOutflow: round2(capexOutflow),
        debtService: round2(debtService),
        dscr: debtService > 0 ? round2((ebitda - (isLastYear ? terminalValue : 0)) / debtService) : null,
        projectCashflow: round2(projectCashflow),
        equityCashflow: round2(equityCashflow),
        cumulativeProjectCashflow: round2(cumulative),
      });
    }

    const projectFlows = years.map((r) => r.projectCashflow);
    const equityFlows = years.map((r) => r.equityCashflow);
    // Bankability DSCR is measured at stabilization (ramp-up years are covered
    // by a DSRA/interest-only structure in practice); the per-year table still
    // shows every year so the ramp exposure stays visible.
    const stabilizedFrom = a.constructionYears + a.rampUp.length;
    const dscrValues = years
      .filter((r, idx) => idx >= stabilizedFrom)
      .map((r) => r.dscr)
      .filter((d): d is number => d !== null);

    const split = a.capexSplit;
    return {
      years,
      capexBreakdown: {
        land: round2(capex * split.land),
        construction: round2(capex * split.construction),
        softCosts: round2(capex * split.softCosts),
        contingency: round2(capex * split.contingency),
      },
      stabilizedRevenue: round2(stabilizedRevenue),
      stabilizedEbitda: round2(stabilizedEbitda),
      terminalValue: round2(terminalValue),
      debtAmount: round2(debtAmount),
      equityAmount: round2(equityAmount),
      annualDebtService: round2(annualDebtService),
      npv: round2(this.npv(a.discountRatePct, projectFlows)),
      projectIrr: this.irr(projectFlows),
      equityIrr: this.irr(equityFlows),
      paybackYears: this.paybackYears(projectFlows),
      dscr: {
        min: dscrValues.length ? round2(Math.min(...dscrValues)) : null,
        avg: dscrValues.length
          ? round2(dscrValues.reduce((s, d) => s + d, 0) / dscrValues.length)
          : null,
      },
    };
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
