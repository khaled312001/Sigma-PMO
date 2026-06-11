import { EarnedScheduleService } from './earned-schedule.service';

describe('EarnedScheduleService — deterministic Earned-Schedule math (L4)', () => {
  const svc = new EarnedScheduleService();

  /**
   * KNOWN-ANSWER, hand-computable 2-activity case.
   *
   * Project: plannedStart 2026-01-01, plannedFinish 2026-01-21 → 20-day plan.
   * Activity A: $100, 2026-01-01 → 2026-01-11 (days 0..10, half the plan).
   * Activity B: $100, 2026-01-11 → 2026-01-21 (days 10..20, second half).
   *
   * Cumulative PV curve points (offsetDays, cumPV):
   *   day 0  → 0
   *   day 10 → 100  (A fully planned, B not started)
   *   day 20 → 200  (both fully planned)
   *
   * dataDate = 2026-01-11 → AT = 10 days.
   * Suppose EV = $50 (only A is 50% earned).
   *   ES: curve reaches 50 between day 0 (pv 0) and day 10 (pv 100):
   *       frac = (50-0)/(100-0) = 0.5 → ES = 0 + 0.5*(10-0) = 5 days.
   *   SPI(t) = ES/AT = 5/10 = 0.5.
   *   predictedDuration = plannedDuration / SPI(t) = 20 / 0.5 = 40 days.
   *   predictedCompletion = 2026-01-01 + 40 days = 2026-02-10.
   */
  it('half-earned at mid-plan → ES=5, AT=10, SPIt=0.5, duration doubles', () => {
    const r = svc.compute({
      projectPlannedStart: '2026-01-01',
      projectPlannedFinish: '2026-01-21',
      dataDate: '2026-01-11',
      ev: 50,
      activities: [
        { budgetedCost: 100, plannedStart: '2026-01-01', plannedFinish: '2026-01-11' },
        { budgetedCost: 100, plannedStart: '2026-01-11', plannedFinish: '2026-01-21' },
      ],
    });
    expect(r.at).toBe(10);
    expect(r.plannedDurationDays).toBe(20);
    expect(r.es).toBe(5);
    expect(r.spiT).toBe(0.5);
    expect(r.predictedDurationDays).toBe(40);
    expect(r.predictedCompletionDate).toBe('2026-02-10');
    expect(r.capped).toBe(false);
  });

  it('on-plan (EV equals PV-to-date) → SPIt=1, duration unchanged', () => {
    // At day 10, on-plan EV should equal cumulative PV at day 10 = 100.
    const r = svc.compute({
      projectPlannedStart: '2026-01-01',
      projectPlannedFinish: '2026-01-21',
      dataDate: '2026-01-11',
      ev: 100,
      activities: [
        { budgetedCost: 100, plannedStart: '2026-01-01', plannedFinish: '2026-01-11' },
        { budgetedCost: 100, plannedStart: '2026-01-11', plannedFinish: '2026-01-21' },
      ],
    });
    expect(r.es).toBe(10);
    expect(r.spiT).toBe(1);
    expect(r.predictedDurationDays).toBe(20);
    expect(r.predictedCompletionDate).toBe('2026-01-21');
  });

  it('EV at or beyond total PV → ES clamps to plan end', () => {
    const r = svc.compute({
      projectPlannedStart: '2026-01-01',
      projectPlannedFinish: '2026-01-21',
      dataDate: '2026-01-21',
      ev: 999,
      activities: [
        { budgetedCost: 100, plannedStart: '2026-01-01', plannedFinish: '2026-01-11' },
        { budgetedCost: 100, plannedStart: '2026-01-11', plannedFinish: '2026-01-21' },
      ],
    });
    expect(r.es).toBe(20);
  });

  it('zero EV → ES=0, SPIt=0, duration capped at 3×', () => {
    const r = svc.compute({
      projectPlannedStart: '2026-01-01',
      projectPlannedFinish: '2026-01-21',
      dataDate: '2026-01-11',
      ev: 0,
      activities: [
        { budgetedCost: 100, plannedStart: '2026-01-01', plannedFinish: '2026-01-11' },
        { budgetedCost: 100, plannedStart: '2026-01-11', plannedFinish: '2026-01-21' },
      ],
    });
    expect(r.es).toBe(0);
    expect(r.spiT).toBe(0);
    expect(r.predictedDurationDays).toBe(60); // 20 * 3 cap
    expect(r.capped).toBe(true);
  });

  it('no project plannedStart → all schedule outputs null', () => {
    const r = svc.compute({
      projectPlannedStart: null,
      projectPlannedFinish: null,
      dataDate: null,
      ev: 50,
      activities: [],
    });
    expect(r.es).toBeNull();
    expect(r.at).toBeNull();
    expect(r.spiT).toBeNull();
    expect(r.predictedCompletionDate).toBeNull();
  });

  it('caps forecast at 3× when SPIt is very low', () => {
    // ES tiny vs AT → SPIt well below 1/3 → raw duration > 3× → capped.
    const r = svc.compute({
      projectPlannedStart: '2026-01-01',
      projectPlannedFinish: '2026-01-21',
      dataDate: '2026-01-21', // AT = 20
      ev: 10, // ES ≈ 1 day → SPIt ≈ 0.05 → raw 400 days
      activities: [
        { budgetedCost: 100, plannedStart: '2026-01-01', plannedFinish: '2026-01-11' },
        { budgetedCost: 100, plannedStart: '2026-01-11', plannedFinish: '2026-01-21' },
      ],
    });
    expect(r.predictedDurationDays).toBe(60); // 20 * 3
    expect(r.capped).toBe(true);
  });
});
