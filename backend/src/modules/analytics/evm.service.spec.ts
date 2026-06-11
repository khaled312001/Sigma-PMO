import { EvmService } from './evm.service';

describe('EvmService — deterministic Earned-Value math (L4)', () => {
  const svc = new EvmService();

  it('a perfectly on-track project scores SPI=CPI=1', () => {
    // 2 activities, each $100 budget, 50% planned & 50% earned, $50 spent each.
    const r = svc.compute([
      { budgetedCost: 100, actualCost: 50, plannedPctComplete: 0.5, actualPctComplete: 0.5 },
      { budgetedCost: 100, actualCost: 50, plannedPctComplete: 0.5, actualPctComplete: 0.5 },
    ]);
    expect(r.bac).toBe(200);
    expect(r.pv).toBe(100);
    expect(r.ev).toBe(100);
    expect(r.ac).toBe(100);
    expect(r.spi).toBe(1);
    expect(r.cpi).toBe(1);
    expect(r.eac).toBe(200);
    expect(r.vac).toBe(0);
    expect(r.costedActivityCount).toBe(2);
  });

  it('behind schedule + over budget → SPI<1, CPI<1, EAC>BAC', () => {
    // $1000 budget, planned 60% ($600 PV), earned 40% ($400 EV), spent $500.
    const r = svc.compute([
      { budgetedCost: 1000, actualCost: 500, plannedPctComplete: 0.6, actualPctComplete: 0.4 },
    ]);
    expect(r.pv).toBe(600);
    expect(r.ev).toBe(400);
    expect(r.ac).toBe(500);
    expect(r.sv).toBe(-200); // behind
    expect(r.cv).toBe(-100); // over budget
    expect(r.spi).toBeCloseTo(0.667, 2);
    expect(r.cpi).toBe(0.8);
    expect(r.eac).toBe(1250); // 1000 / 0.8
    expect(r.etc).toBe(750); // 1250 - 500
    expect(r.vac).toBe(-250); // 1000 - 1250 (overrun)
  });

  it('handles string decimals from the MySQL driver', () => {
    const r = svc.compute([
      { budgetedCost: '100.00' as unknown as number, actualCost: '25.00' as unknown as number, plannedPctComplete: 0.25, actualPctComplete: 0.25 },
    ]);
    expect(r.bac).toBe(100);
    expect(r.ev).toBe(25);
  });

  it('zero PV / AC yields null indices (no divide-by-zero)', () => {
    const r = svc.compute([
      { budgetedCost: 100, actualCost: 0, plannedPctComplete: 0, actualPctComplete: 0 },
    ]);
    expect(r.spi).toBeNull();
    expect(r.cpi).toBeNull();
    expect(r.eac).toBeNull();
  });

  it('clamps out-of-range percentages', () => {
    const r = svc.compute([
      { budgetedCost: 100, actualCost: 100, plannedPctComplete: 1.5, actualPctComplete: -0.2 },
    ]);
    expect(r.pv).toBe(100); // clamped to 1.0
    expect(r.ev).toBe(0); // clamped to 0
  });

  it('empty input is all zeros, indices null', () => {
    const r = svc.compute([]);
    expect(r.bac).toBe(0);
    expect(r.spi).toBeNull();
    expect(r.costedActivityCount).toBe(0);
  });
});
