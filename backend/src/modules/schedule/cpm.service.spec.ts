import { ActivityLike, CpmService } from './cpm.service';

/**
 * CpmService forward/backward-pass spec (Mr. Ayham acceptance 2026-06-28).
 *
 * Network under test:
 *
 *   A(5) ─FS→ B(5) ─FS→ C(5) ─FS→ D(5)     ← the critical chain (float 0)
 *     └─FS→ E(2) ─FS→ C                      ← E is a short parallel feeder (float)
 *
 * Day-indexed (day 0 = project start):
 *   A: ES 0  EF 5    B: ES 5  EF 10   C: ES 10 EF 15   D: ES 15 EF 20
 *   E: ES 5  EF 7  — but C cannot start before B finishes (day 10), so E has
 *   float: its LF is driven by C's LS (10) ⇒ E.LS = 8, E.totalFloat = 3.
 * Project duration = 20 days; critical path = A,B,C,D.
 */
function chain(): ActivityLike[] {
  return [
    { businessKey: 'A', name: 'A', plannedDurationDays: 5, predecessors: null },
    { businessKey: 'B', name: 'B', plannedDurationDays: 5, predecessors: [{ activityKey: 'A', type: 'FS', lagDays: 0 }] },
    {
      businessKey: 'C',
      name: 'C',
      plannedDurationDays: 5,
      predecessors: [
        { activityKey: 'B', type: 'FS', lagDays: 0 },
        { activityKey: 'E', type: 'FS', lagDays: 0 },
      ],
    },
    { businessKey: 'D', name: 'D', plannedDurationDays: 5, predecessors: [{ activityKey: 'C', type: 'FS', lagDays: 0 }] },
    { businessKey: 'E', name: 'E', plannedDurationDays: 2, predecessors: [{ activityKey: 'A', type: 'FS', lagDays: 0 }] },
  ];
}

describe('CpmService.compute (forward/backward pass)', () => {
  const svc = new CpmService(null as never, null as never);

  it('computes ES/EF/LS/LF + isCritical matching hand-computed values', () => {
    const res = svc.compute('P-T', chain());
    expect(res.hasLogic).toBe(true);
    expect(res.projectDurationDays).toBe(20);

    const byKey = new Map(res.activities.map((a) => [a.businessKey, a]));
    const a = byKey.get('A')!;
    const b = byKey.get('B')!;
    const c = byKey.get('C')!;
    const d = byKey.get('D')!;
    const e = byKey.get('E')!;

    expect([a.es, a.ef]).toEqual([0, 5]);
    expect([b.es, b.ef]).toEqual([5, 10]);
    expect([c.es, c.ef]).toEqual([10, 15]);
    expect([d.es, d.ef]).toEqual([15, 20]);
    expect([e.es, e.ef]).toEqual([5, 7]);

    // Critical chain has zero float.
    for (const k of ['A', 'B', 'C', 'D']) {
      const x = byKey.get(k)!;
      expect(x.totalFloat).toBe(0);
      expect(x.isCritical).toBe(true);
      expect(x.ls).toBe(x.es);
      expect(x.lf).toBe(x.ef);
    }

    // E floats: LS 8, LF 10, float 3, not critical.
    expect(e.totalFloat).toBe(3);
    expect(e.isCritical).toBe(false);
    expect(e.ls).toBe(8);
    expect(e.lf).toBe(10);

    // Critical path keys.
    expect(res.criticalPath.sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('reports hasLogic=false when no predecessors are present', () => {
    const res = svc.compute('P-T', [
      { businessKey: 'X', name: 'X', plannedDurationDays: 3, predecessors: null },
      { businessKey: 'Y', name: 'Y', plannedDurationDays: 4, predecessors: null },
    ]);
    expect(res.hasLogic).toBe(false);
    expect(res.projectDurationDays).toBe(4);
  });
});

describe('CpmService.computeImpact (delay-impact / TIA)', () => {
  const svc = new CpmService(null as never, null as never);

  it('returns a 10-day slip when a critical activity is delayed by 10 days', () => {
    const impact = svc.computeImpact('P-T', chain(), ['B'], 10);
    expect(impact.baselineDurationDays).toBe(20);
    expect(impact.projectedDurationDays).toBe(30);
    expect(impact.projectSlipDays).toBe(10);
  });

  it('returns a 0-day slip when the delay is fully absorbed by float', () => {
    // E has 3 days of float; a 2-day delay on E does not slip the project.
    const impact = svc.computeImpact('P-T', chain(), ['E'], 2);
    expect(impact.projectSlipDays).toBe(0);
    expect(impact.criticalPathChanged).toBe(false);
  });

  it('a delay exceeding float pushes the project and changes the critical path', () => {
    // E float 3 → a 6-day delay pushes 3 days onto completion and pulls E onto
    // the critical path.
    const impact = svc.computeImpact('P-T', chain(), ['E'], 6);
    expect(impact.projectSlipDays).toBe(3);
    expect(impact.criticalPathChanged).toBe(true);
  });
});
