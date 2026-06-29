import { ForensicDelayService, ScheduleActivity } from './forensic-delay.service';

/**
 * ForensicDelayService — deterministic engine tests (Mr. Ayham acceptance #1).
 * compute() takes activities directly (no DB), so we exercise the forensic logic:
 * driving-path isolation, concurrency netting and the EOT strength verdict.
 */
describe('ForensicDelayService', () => {
  const svc = new ForensicDelayService(null as never, null as never);

  it('returns an empty, weak report when there are no dated activities', () => {
    const r = svc.compute('P1', 'Project 1', null, null, []);
    expect(r.activitiesAnalysed).toBe(0);
    expect(r.projectDelayDays).toBe(0);
    expect(r.entitlement.strength).toBe('weak');
  });

  it('rates a clean single-driver critical slip as STRONG with full EOT', () => {
    const rows: ScheduleActivity[] = [
      // The completion-driving activity slips 30 days on zero float.
      { name: 'Fit-out', plannedStart: '2026-01-01', plannedFinish: '2026-03-31', actualStart: '2026-01-01', actualFinish: '2026-04-30' },
      // An earlier activity with slack and no slip — not a driver.
      { name: 'Earthworks', plannedStart: '2026-01-01', plannedFinish: '2026-02-28', actualStart: '2026-01-01', actualFinish: '2026-02-28' },
    ];
    const r = svc.compute('P2', 'Project 2', '2026-04-30', '2026-01-01', rows);
    expect(r.projectDelayDays).toBe(30);
    expect(r.criticalDrivers.map((d) => d.name)).toContain('Fit-out');
    expect(r.criticalDrivers.map((d) => d.name)).not.toContain('Earthworks');
    expect(r.concurrency.concurrentDays).toBe(0);
    expect(r.entitlement.supportedEotDays).toBe(30);
    expect(r.entitlement.strength).toBe('strong');
  });

  it('rates a slip absorbed by float (no completion impact) as WEAK', () => {
    const rows: ScheduleActivity[] = [
      { name: 'Early task', plannedStart: '2026-01-01', plannedFinish: '2026-03-31', actualStart: '2026-01-01', actualFinish: '2026-04-30' },
      // The true completion driver finishes much later and on time.
      { name: 'Commissioning', plannedStart: '2026-10-01', plannedFinish: '2026-12-31', actualStart: '2026-10-01', actualFinish: '2026-12-31' },
    ];
    const r = svc.compute('P3', 'Project 3', '2026-12-31', '2026-01-01', rows);
    expect(r.projectDelayDays).toBe(0);
    expect(r.criticalDrivers.length).toBe(0);
    expect(r.entitlement.strength).toBe('weak');
  });

  it('rates concurrency-dominated delay as WEAK and nets out the concurrent days', () => {
    const rows: ScheduleActivity[] = [
      { name: 'MEP', plannedStart: '2026-01-01', plannedFinish: '2026-03-31', actualStart: '2026-01-01', actualFinish: '2026-05-30' }, // +60
      { name: 'Cladding', plannedStart: '2026-01-01', plannedFinish: '2026-03-25', actualStart: '2026-01-01', actualFinish: '2026-05-28' }, // +64
    ];
    const r = svc.compute('P4', 'Project 4', '2026-05-30', '2026-01-01', rows);
    expect(r.projectDelayDays).toBe(60);
    expect(r.criticalDrivers.length).toBe(2);
    expect(r.concurrency.concurrentDays).toBeGreaterThan(0);
    // Most of the net delay is concurrent → little is compensable → weak.
    expect(r.classification.concurrentNonCompensableDays).toBeGreaterThan(r.classification.compensableCandidateDays);
    expect(r.entitlement.strength).toBe('weak');
  });

  it('restricts drivers to the CPM critical path and switches the caveat when logic links are present', () => {
    const rows: ScheduleActivity[] = [
      // Both slip and exceed their float-to-completion, but only A is on the CPM
      // critical path per the supplied logic-network result.
      { businessKey: 'A', name: 'Fit-out', plannedStart: '2026-01-01', plannedFinish: '2026-03-31', actualStart: '2026-01-01', actualFinish: '2026-04-30' },
      { businessKey: 'B', name: 'Landscaping', plannedStart: '2026-01-01', plannedFinish: '2026-03-30', actualStart: '2026-01-01', actualFinish: '2026-04-29' },
    ];
    const r = svc.compute('P5', 'Project 5', '2026-04-30', '2026-01-01', rows, new Set(['A']));
    // B slipped but is OFF the critical path → not a driver.
    expect(r.criticalDrivers.map((d) => d.name)).toContain('Fit-out');
    expect(r.criticalDrivers.map((d) => d.name)).not.toContain('Landscaping');
    // Caveat now states the CPM forward/backward pass was used.
    expect(r.caveats[0]).toMatch(/full CPM forward\/backward pass/);
  });
});
