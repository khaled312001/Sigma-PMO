import { Repository } from 'typeorm';

import { Activity, BoQ, Project, Scenario } from '../canonical/entities';
import { CpmService } from '../schedule/cpm.service';
import { SimulationEngineService } from './simulation-engine.service';

/**
 * Test plan (correction-plan §2.3 acceptance criteria):
 *  - Critical-path activity (zero float) delayed by D → project slips D days.
 *  - Activity with float F ≥ D → delay absorbed, project slip 0.
 *  - Activity with float F < D → project slips D − F.
 *  - No affected keys given → conservative-critical assumption recorded.
 *  - Cost delta layered onto the current BoQ total; null cost honestly flagged.
 *  - A Scenario row persists with the input + projection snapshot.
 */

function makeProject(): Project {
  return {
    id: 'proj-1',
    businessKey: 'P-1000',
    name: 'Tower A',
    isCurrent: true,
  } as unknown as Project;
}

function makeActivity(over: Partial<Activity>): Activity {
  return {
    id: `act-${Math.abs(JSON.stringify(over).length)}-${over.businessKey}`,
    businessKey: 'A-1',
    projectId: 'proj-1',
    isCurrent: true,
    version: 1,
    name: 'Activity',
    plannedStart: '2026-01-01',
    plannedFinish: '2026-06-30',
    plannedDurationDays: 60,
    remainingDurationDays: 60,
    ...over,
  } as unknown as Activity;
}

function buildService(opts: {
  activities: Activity[];
  boqTotal?: string | null;
  withCpm?: boolean;
}) {
  const scenarioStore: Scenario[] = [];
  const projects = {
    findOne: jest.fn(async () => makeProject()),
  };
  const activities = {
    find: jest.fn(async () => opts.activities),
  };
  const boqs = {
    findOne: jest.fn(async () =>
      opts.boqTotal === undefined || opts.boqTotal === null
        ? null
        : ({ totalAmount: opts.boqTotal, currency: 'AED' } as unknown as BoQ),
    ),
  };
  const scenarios = {
    create: jest.fn((init: Partial<Scenario>) => init as Scenario),
    save: jest.fn(async (s: Scenario) => {
      const saved = { ...s, id: s.id ?? `scn-${scenarioStore.length + 1}` } as Scenario;
      scenarioStore.push(saved);
      return saved;
    }),
  };
  const cpm = opts.withCpm ? new CpmService(null as never, null as never) : undefined;
  const svc = new SimulationEngineService(
    projects as unknown as Repository<Project>,
    activities as unknown as Repository<Activity>,
    boqs as unknown as Repository<BoQ>,
    scenarios as unknown as Repository<Scenario>,
    cpm,
  );
  return { svc, scenarioStore };
}

const BASE_INPUT = {
  projectKey: 'P-1000',
  clashId: 'clash-1',
  optionIndex: 0,
  optionLabel: 'Re-route duct',
  costImpactAED: 100_000,
  requestedBy: 'PD',
};

describe('SimulationEngineService.projectClashImpact', () => {
  it('slips the project by D when the affected activity is critical (zero float)', async () => {
    const { svc } = buildService({
      activities: [
        makeActivity({ businessKey: 'A-CRIT', plannedFinish: '2026-06-30' }),
        makeActivity({ businessKey: 'A-EARLY', plannedFinish: '2026-03-31' }),
      ],
      boqTotal: '1000000.00',
    });
    const p = await svc.projectClashImpact({
      ...BASE_INPUT,
      durationImpactDays: 15,
      affectedActivityKeys: ['A-CRIT'],
    });
    expect(p.durationDeltaDays).toBe(15);
    expect(p.baselineFinishIso).toBe('2026-06-30');
    expect(p.projectedFinishIso).toBe('2026-07-15');
    expect(p.criticalPathChanged).toBe(true);
    expect(p.affectedActivities[0].absorbedByFloat).toBe(false);
  });

  it('absorbs the delay entirely when the activity float exceeds it', async () => {
    const { svc } = buildService({
      activities: [
        makeActivity({ businessKey: 'A-CRIT', plannedFinish: '2026-06-30' }),
        makeActivity({ businessKey: 'A-FLOATY', plannedFinish: '2026-03-31' }), // 91d float
      ],
    });
    const p = await svc.projectClashImpact({
      ...BASE_INPUT,
      durationImpactDays: 15,
      affectedActivityKeys: ['A-FLOATY'],
    });
    expect(p.durationDeltaDays).toBe(0);
    expect(p.projectedFinishIso).toBe('2026-06-30');
    expect(p.criticalPathChanged).toBe(false);
    expect(p.affectedActivities[0].absorbedByFloat).toBe(true);
  });

  it('slips by D − float when the delay exceeds the float', async () => {
    const { svc } = buildService({
      activities: [
        makeActivity({ businessKey: 'A-CRIT', plannedFinish: '2026-06-30' }),
        makeActivity({ businessKey: 'A-NEAR', plannedFinish: '2026-06-25' }), // 5d float
      ],
    });
    const p = await svc.projectClashImpact({
      ...BASE_INPUT,
      durationImpactDays: 15,
      affectedActivityKeys: ['A-NEAR'],
    });
    expect(p.durationDeltaDays).toBe(10); // 15 − 5
    expect(p.projectedFinishIso).toBe('2026-07-10');
  });

  it('assumes the critical activity when no keys are provided, and says so', async () => {
    const { svc } = buildService({
      activities: [
        makeActivity({ businessKey: 'A-CRIT', plannedFinish: '2026-06-30' }),
        makeActivity({ businessKey: 'A-EARLY', plannedFinish: '2026-02-28' }),
      ],
    });
    const p = await svc.projectClashImpact({ ...BASE_INPUT, durationImpactDays: 7 });
    expect(p.durationDeltaDays).toBe(7);
    expect(p.affectedActivities.map((a) => a.businessKey)).toEqual(['A-CRIT']);
    expect(p.assumptions.join(' ')).toMatch(/assumed the latest-finishing/);
  });

  it('layers the cost delta on the BoQ total; flags a missing BoQ honestly', async () => {
    const withBoq = buildService({
      activities: [makeActivity({ businessKey: 'A-1' })],
      boqTotal: '500000.00',
    });
    const p1 = await withBoq.svc.projectClashImpact({
      ...BASE_INPUT,
      durationImpactDays: 0,
      affectedActivityKeys: ['A-1'],
    });
    expect(p1.baselineCostAED).toBe('500000.00');
    expect(p1.projectedCostAED).toBe('600000.00');
    expect(p1.costDeltaAED).toBe(100_000);

    const noBoq = buildService({ activities: [makeActivity({ businessKey: 'A-1' })] });
    const p2 = await noBoq.svc.projectClashImpact({
      ...BASE_INPUT,
      durationImpactDays: 0,
      affectedActivityKeys: ['A-1'],
    });
    expect(p2.baselineCostAED).toBeNull();
    expect(p2.assumptions.join(' ')).toMatch(/No current BoQ/);
  });

  it('persists a Scenario carrying the input and the projection', async () => {
    const { svc, scenarioStore } = buildService({
      activities: [makeActivity({ businessKey: 'A-CRIT', plannedFinish: '2026-06-30' })],
    });
    const p = await svc.projectClashImpact({
      ...BASE_INPUT,
      durationImpactDays: 15,
      affectedActivityKeys: ['A-CRIT'],
    });
    expect(p.scenarioId).toBe(scenarioStore[0].id);
    expect(scenarioStore).toHaveLength(1);
    const snap = scenarioStore[0].baselineSnapshot as {
      kind: string;
      input: { clashId: string; durationImpactDays: number };
      projection: { durationDeltaDays: number };
    };
    expect(snap.kind).toBe('clash-impact');
    expect(snap.input.clashId).toBe('clash-1');
    expect(snap.projection.durationDeltaDays).toBe(15);
    expect(scenarioStore[0].status).toBe('open');
  });

  it('uses a CPM re-pass over the logic network when predecessors are present', async () => {
    const { svc } = buildService({
      withCpm: true,
      activities: [
        makeActivity({
          businessKey: 'A-1',
          plannedStart: '2026-01-01',
          plannedFinish: '2026-01-10',
          plannedDurationDays: 9,
          predecessors: null,
        } as unknown as Partial<Activity>),
        makeActivity({
          businessKey: 'A-2',
          plannedStart: '2026-01-11',
          plannedFinish: '2026-01-20',
          plannedDurationDays: 9,
          predecessors: [{ activityKey: 'A-1', type: 'FS', lagDays: 0 }],
        } as unknown as Partial<Activity>),
      ],
    });
    const p = await svc.projectClashImpact({
      ...BASE_INPUT,
      durationImpactDays: 10,
      affectedActivityKeys: ['A-1'],
    });
    // A-1 is critical (its successor depends on it) → a 10-day delay slips 10.
    expect(p.durationDeltaDays).toBe(10);
    expect(p.assumptions.join(' ')).toMatch(/CPM re-pass over the persisted predecessor logic network/);
  });

  it('rejects when none of the provided keys exist in the schedule', async () => {
    const { svc } = buildService({
      activities: [makeActivity({ businessKey: 'A-1' })],
    });
    await expect(
      svc.projectClashImpact({
        ...BASE_INPUT,
        durationImpactDays: 5,
        affectedActivityKeys: ['NOPE'],
      }),
    ).rejects.toThrow(/None of the provided/);
  });
});
