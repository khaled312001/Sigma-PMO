import { GovernanceStatus } from '../../common/enums';
import { GovernanceStatusService } from './governance-status.service';

/**
 * Pure-rule tests for the 4-tier governance status (the plan's highest-risk
 * piece). We construct the service with no repositories because `computeLeaf`
 * and `rollUp` are pure — they never touch the injected repos.
 */
describe('GovernanceStatusService — deterministic 4-tier rule', () => {
  const svc = new GovernanceStatusService(
    null as never, null as never, null as never, null as never,
    null as never, null as never, null as never, null as never,
  );

  const clean = { criticalCount: 0, warningCount: 0, infoCount: 0, maxEscalation: 0, confidenceAvg: 1 };

  describe('computeLeaf', () => {
    it('a clean node is GREEN', () => {
      expect(svc.computeLeaf(clean).status).toBe(GovernanceStatus.GREEN);
    });

    it('a single warning lifts to YELLOW', () => {
      expect(svc.computeLeaf({ ...clean, warningCount: 1 }).status).toBe(GovernanceStatus.YELLOW);
    });

    it('low data confidence alone lifts to YELLOW', () => {
      expect(svc.computeLeaf({ ...clean, confidenceAvg: 0.5 }).status).toBe(GovernanceStatus.YELLOW);
    });

    it('any critical alert is at least ORANGE', () => {
      const r = svc.computeLeaf({ ...clean, criticalCount: 1 });
      expect([GovernanceStatus.ORANGE, GovernanceStatus.RED]).toContain(r.status);
      expect(r.status).toBe(GovernanceStatus.ORANGE);
    });

    it('an L3 escalation forces RED regardless of counts', () => {
      expect(svc.computeLeaf({ ...clean, maxEscalation: 3 }).status).toBe(GovernanceStatus.RED);
    });

    it('a flood of criticals (>=5) forces RED', () => {
      expect(svc.computeLeaf({ ...clean, criticalCount: 5 }).status).toBe(GovernanceStatus.RED);
    });

    it('score is monotonic in severity (worse inputs never score lower)', () => {
      const a = svc.computeLeaf({ ...clean, warningCount: 1 }).score;
      const b = svc.computeLeaf({ ...clean, warningCount: 1, criticalCount: 1 }).score;
      const c = svc.computeLeaf({ ...clean, warningCount: 1, criticalCount: 3, maxEscalation: 2 }).score;
      expect(b).toBeGreaterThanOrEqual(a);
      expect(c).toBeGreaterThanOrEqual(b);
    });

    it('records reproducible inputs + the rule id', () => {
      const r = svc.computeLeaf({ ...clean, criticalCount: 2 });
      expect(r.inputs.rule).toBe('leaf-ladder-v1');
      expect(r.inputs.criticalCount).toBe(2);
      expect((r.inputs.weights as Record<string, number>).critical).toBe(0.35);
    });
  });

  describe('rollUp (worst-of-children)', () => {
    it('empty children → GREEN', () => {
      expect(svc.rollUp([], []).status).toBe(GovernanceStatus.GREEN);
    });

    it('all green → GREEN', () => {
      expect(svc.rollUp([GovernanceStatus.GREEN, GovernanceStatus.GREEN], [0, 0]).status).toBe(GovernanceStatus.GREEN);
    });

    it('one red child makes the parent RED', () => {
      const r = svc.rollUp(
        [GovernanceStatus.GREEN, GovernanceStatus.YELLOW, GovernanceStatus.RED],
        [0.1, 0.4, 0.9],
      );
      expect(r.status).toBe(GovernanceStatus.RED);
      expect(r.score).toBeCloseTo(0.9);
    });

    it('worst is ORANGE when no red present', () => {
      expect(
        svc.rollUp([GovernanceStatus.GREEN, GovernanceStatus.ORANGE, GovernanceStatus.YELLOW], [0, 0.6, 0.4]).status,
      ).toBe(GovernanceStatus.ORANGE);
    });

    it('tallies children for the audit trail', () => {
      const r = svc.rollUp(
        [GovernanceStatus.GREEN, GovernanceStatus.GREEN, GovernanceStatus.RED],
        [0, 0, 0.9],
      );
      expect((r.inputs.tally as Record<string, number>)).toEqual({ green: 2, yellow: 0, orange: 0, red: 1 });
    });
  });
});
