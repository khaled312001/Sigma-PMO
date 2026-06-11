import { FinancialModelService } from './financial-model.service';
import { PROJECT_TYPE_ASSUMPTIONS, LOCATION_FACTORS } from './assumption-library';

/**
 * Known-answer tests for the deterministic investment mathematics. Every
 * expected value here is hand-computable — the same discipline as the EVM
 * known-answer suite (Phase 3).
 */
describe('FinancialModelService', () => {
  const svc = new FinancialModelService();

  it('npv: textbook example', () => {
    // -1000 + 500/1.1 + 500/1.21 + 500/1.331 = 243.43
    expect(svc.npv(0.1, [-1000, 500, 500, 500])).toBeCloseTo(243.42, 1);
  });

  it('irr: exact cube-root case', () => {
    // -1000 grows to 1331 in 3 years → irr = 10%
    const r = svc.irr([-1000, 0, 0, 1331]);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.1, 3);
  });

  it('irr: returns null when no sign change', () => {
    expect(svc.irr([100, 200, 300])).toBeNull();
    expect(svc.irr([-100, -200])).toBeNull();
  });

  it('annuity: standard amortization payment', () => {
    // 1000 @ 5% over 5y → 230.97/yr
    expect(svc.annuity(1000, 0.05, 5)).toBeCloseTo(230.97, 1);
    // zero-rate degenerates to straight-line
    expect(svc.annuity(1000, 0, 4)).toBe(250);
  });

  it('payback: fractional interpolation', () => {
    // -1000 then 400/yr → breakeven half-way through year 3 → 2.5
    expect(svc.paybackYears([-1000, 400, 400, 400])).toBe(2.5);
    expect(svc.paybackYears([-1000, 100, 100])).toBeNull();
  });

  it('build: residential Dubai model is internally consistent', () => {
    const out = svc.build({
      capex: 100_000_000,
      equityPct: 0.4,
      debtPct: 0.6,
      interestRatePct: 0.06,
      tenorYears: 15,
      assumptions: PROJECT_TYPE_ASSUMPTIONS.residential,
      location: LOCATION_FACTORS.dubai,
    });

    // CAPEX split sums back to the envelope.
    const splitSum = Object.values(out.capexBreakdown).reduce((s, v) => s + v, 0);
    expect(splitSum).toBeCloseTo(100_000_000, 0);

    // Dubai marketStrength=5 → revenueAdj = 1.10 → 100M × 12% × 1.10 = 13.2M.
    expect(out.stabilizedRevenue).toBeCloseTo(13_200_000, 0);
    // EBITDA margin = 1 − 0.28.
    expect(out.stabilizedEbitda).toBeCloseTo(13_200_000 * 0.72, 0);

    // Debt 60M @6% / 15y annuity.
    expect(out.debtAmount).toBe(60_000_000);
    expect(out.annualDebtService).toBeCloseTo(svc.annuity(60_000_000, 0.06, 15), 2);

    // 2 construction + 7 operating (hold) years.
    expect(out.years).toHaveLength(9);
    expect(out.years[0].phase).toBe('construction');
    expect(out.years[0].capexOutflow).toBeCloseTo(50_000_000, 0);
    expect(out.years[2].phase).toBe('operation');
    // First operating year ramp 0.55.
    expect(out.years[2].revenue).toBeCloseTo(13_200_000 * 0.55, 0);

    // Exit value (15× stabilized EBITDA) lands in the last year's EBITDA.
    expect(out.terminalValue).toBeCloseTo(13_200_000 * 0.72 * 15, 0);
    const last = out.years[out.years.length - 1];
    expect(last.ebitda).toBeGreaterThan(out.terminalValue);

    // Exit balloon: outstanding balance after 7 of 15 payments is settled
    // from the final equity cash flow (no free balloon).
    const balloon = svc.remainingBalance(60_000_000, 0.06, 15, 7);
    expect(balloon).toBeGreaterThan(0);
    expect(last.equityCashflow).toBeCloseTo(last.ebitda - last.debtService - balloon, 0);

    // A healthy residential deal at these benchmarks clears the discount rate.
    expect(out.npv).toBeGreaterThan(0);
    expect(out.projectIrr).not.toBeNull();
    expect(out.projectIrr!).toBeGreaterThan(0.1);
    expect(out.paybackYears).not.toBeNull();
    // Stabilized DSCR (the bankability metric) is healthy.
    expect(out.dscr.min).not.toBeNull();
    expect(out.dscr.min!).toBeGreaterThan(1.2);
  });
});
