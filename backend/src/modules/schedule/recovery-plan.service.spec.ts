import { DataSource, Repository } from 'typeorm';

import { Activity, Project, Scenario } from '../canonical/entities';
import { ActivityLike, CpmService } from './cpm.service';
import { RecoveryMove, RecoveryPlanService, RecoveryStrategy } from './recovery-plan.service';

/**
 * RecoveryPlanService spec (Task 4). A project finishing late must yield a
 * crash option recovering ≥10 days at a positive cost and a fast-track option
 * recovering days at zero direct cost; applying an option produces revised
 * (append-only) Activity versions.
 *
 * Network: A(30) ─FS→ B(30) ─FS→ C(30) — a 90-day critical chain.
 */
function lateChain(): ActivityLike[] {
  return [
    { businessKey: 'A', name: 'A', plannedStart: '2026-01-01', plannedFinish: '2026-01-31', plannedDurationDays: 30, budgetedCost: '300000.00', predecessors: null },
    { businessKey: 'B', name: 'B', plannedStart: '2026-02-01', plannedFinish: '2026-03-02', plannedDurationDays: 30, budgetedCost: '300000.00', predecessors: [{ activityKey: 'A', type: 'FS', lagDays: 0 }] },
    { businessKey: 'C', name: 'C', plannedStart: '2026-03-03', plannedFinish: '2026-04-01', plannedDurationDays: 30, budgetedCost: '300000.00', predecessors: [{ activityKey: 'B', type: 'FS', lagDays: 0 }] },
  ];
}

describe('RecoveryPlanService.computeProposal', () => {
  const svc = new RecoveryPlanService(
    null as never,
    null as never,
    null as never,
    null as never,
    new CpmService(null as never, null as never),
  );

  it('produces a crash option recovering >=10 days at a positive cost', () => {
    const p = svc.computeProposal('P-LATE', lateChain(), null);
    expect(p.baselineDurationDays).toBe(90);
    const crash = p.options.find((o) => o.strategy === 'crash')!;
    expect(crash).toBeDefined();
    expect(crash.recoveredDays).toBeGreaterThanOrEqual(10);
    expect(crash.costAED).toBeGreaterThan(0);
  });

  it('produces a fast-track option recovering days at zero direct cost', () => {
    const p = svc.computeProposal('P-LATE', lateChain(), null);
    const fast = p.options.find((o) => o.strategy === 'fast-track')!;
    expect(fast).toBeDefined();
    expect(fast.recoveredDays).toBeGreaterThan(0);
    expect(fast.costAED).toBe(0);
  });

  it('honours an explicit target finish for the required recovery', () => {
    // Chain starts 2026-01-01, baseline finish day index 90. Target 60 days in
    // → require 30 days of recovery.
    const p = svc.computeProposal('P-LATE', lateChain(), '2026-03-02');
    expect(p.requiredRecoveryDays).toBe(30);
  });
});

describe('RecoveryPlanService.applyOption', () => {
  it('applies the chosen option as append-only Activity versions', async () => {
    const activityStore: Activity[] = [
      { id: 'a-A', businessKey: 'A', projectId: 'proj-1', isCurrent: true, version: 1, plannedFinish: '2026-01-31', plannedDurationDays: 30, remainingDurationDays: 30, predecessors: null, rawSource: {} } as unknown as Activity,
    ];
    const scenario: Scenario = {
      id: 'scn-1',
      projectBusinessKey: 'P-LATE',
      status: 'open',
      baselineSnapshot: {
        kind: 'recovery-plan',
        options: [
          { strategy: 'crash' as RecoveryStrategy, moves: [{ activityKey: 'A', crashDays: 12 } as RecoveryMove] },
        ],
      },
    } as unknown as Scenario;

    let actId = 100;
    const activityRepo = {
      find: jest.fn(async () => activityStore.filter((a) => a.isCurrent)),
      create: jest.fn((init: Partial<Activity>) => ({ ...init }) as Activity),
      save: jest.fn(async (a: Activity) => {
        if (!a.id) a.id = `a-${actId++}`;
        const idx = activityStore.findIndex((x) => x.id === a.id);
        if (idx >= 0) activityStore[idx] = a;
        else activityStore.push(a);
        return a;
      }),
    };
    const scenarioRepo = {
      findOne: jest.fn(async () => scenario),
      save: jest.fn(async (s: Scenario) => s),
    };
    const projectRepo = {
      findOne: jest.fn(async () => ({ id: 'proj-1', businessKey: 'P-LATE', isCurrent: true }) as Project),
    };
    const managerRepos = new Map<unknown, unknown>([
      [Activity, activityRepo],
      [Scenario, scenarioRepo],
    ]);
    const manager = { getRepository: (e: unknown) => managerRepos.get(e) };
    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb(manager)),
    } as unknown as DataSource;

    const svc = new RecoveryPlanService(
      dataSource,
      projectRepo as unknown as Repository<Project>,
      activityRepo as unknown as Repository<Activity>,
      scenarioRepo as unknown as Repository<Scenario>,
      new CpmService(null as never, null as never),
    );

    const out = await svc.applyOption({ scenarioId: 'scn-1', optionIndex: 0, approvedBy: 'PD' });
    expect(out.revisedActivityKeys).toEqual(['A']);
    expect(out.revisionNumber).toBe(2);
    // v2 clone is current with the crashed duration; v1 retired.
    const aRows = activityStore.filter((a) => a.businessKey === 'A');
    const v2 = aRows.find((a) => a.version === 2)!;
    expect(v2.isCurrent).toBe(true);
    expect(v2.plannedDurationDays).toBe(18); // 30 − 12
    expect(aRows.find((a) => a.version === 1)!.isCurrent).toBe(false);
    expect(scenario.status).toBe('committed');
  });
});
