import { DataSource, Repository } from 'typeorm';

import { Activity, ClashItem, Project, Scenario } from '../canonical/entities';
import { OutboxService } from '../outbox/outbox.service';
import { ScheduleRevisionService } from './schedule-revision.service';

/**
 * Focused spec for the Req 2 widening: `applyClashResolution` must write the
 * `linkedActivityBusinessKey` + `responsibleParty` typed columns onto the
 * clash row (no longer implicit in the revised Activity's rawSource), and
 * still produce append-only Activity versions.
 */

function makeClash(over: Partial<ClashItem> = {}): ClashItem {
  return {
    id: 'clash-1',
    projectBusinessKey: 'P-1000',
    clashRef: 'C-001',
    disciplinesInvolved: ['mechanical', 'structural'],
    severity: 'critical',
    description: 'Duct vs Beam',
    proposedOptions: [
      { label: 'A', timeImpactDays: 5, costImpactAED: 12_000, scopeImpact: 'MEP re-route' },
    ],
    chosenOptionIndex: null,
    decidedBy: null,
    decidedAt: null,
    elementGuidA: null,
    elementGuidB: null,
    locationX: null,
    locationY: null,
    locationZ: null,
    gridLocation: null,
    penetrationMm: null,
    snapshotImagePath: null,
    viewUrn: null,
    viewState: null,
    linkedActivityBusinessKey: null,
    responsibleParty: null,
    ...over,
  } as unknown as ClashItem;
}

function makeActivity(over: Partial<Activity>): Activity {
  return {
    id: `act-${over.businessKey}`,
    businessKey: 'A-CRIT',
    projectId: 'proj-1',
    isCurrent: true,
    version: 1,
    name: 'Critical task',
    plannedStart: '2026-01-01',
    plannedFinish: '2026-06-30',
    plannedDurationDays: 60,
    remainingDurationDays: 60,
    rawSource: {},
    ...over,
  } as unknown as Activity;
}

/** Build a DataSource whose transaction routes getRepository to in-memory fakes. */
function buildService() {
  const clashStore = new Map<string, ClashItem>();
  const activityStore: Activity[] = [
    makeActivity({ businessKey: 'A-CRIT', plannedFinish: '2026-06-30' }),
    makeActivity({ businessKey: 'A-EARLY', plannedFinish: '2026-03-31' }),
  ];
  const clash = makeClash();
  clashStore.set(clash.id, clash);

  let actIdCounter = 100;
  const clashRepo = {
    findOne: jest.fn(async ({ where }: { where: Partial<ClashItem> }) =>
      where.id ? clashStore.get(where.id) ?? null : null,
    ),
    save: jest.fn(async (c: ClashItem) => {
      clashStore.set(c.id, c);
      return c;
    }),
  };
  const activityRepo = {
    find: jest.fn(async () => activityStore.filter((a) => a.isCurrent)),
    create: jest.fn((init: Partial<Activity>) => ({ ...init }) as Activity),
    save: jest.fn(async (a: Activity) => {
      if (!a.id) a.id = `act-${actIdCounter++}`;
      const idx = activityStore.findIndex((x) => x.id === a.id);
      if (idx >= 0) activityStore[idx] = a;
      else activityStore.push(a);
      return a;
    }),
  };
  const scenarioRepo = {
    findOne: jest.fn(async () => null),
    save: jest.fn(async (s: Scenario) => s),
  };
  const projectRepo = {
    findOne: jest.fn(async () => ({ id: 'proj-1', businessKey: 'P-1000', isCurrent: true }) as Project),
  };

  const managerRepos = new Map<unknown, unknown>([
    [ClashItem, clashRepo],
    [Activity, activityRepo],
    [Scenario, scenarioRepo],
  ]);
  const manager = { getRepository: (e: unknown) => managerRepos.get(e) };
  const dataSource = {
    transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb(manager)),
  } as unknown as DataSource;

  const outbox = {
    push: jest.fn(async () => ({ id: 'evt-1' })),
  } as unknown as OutboxService;

  const svc = new ScheduleRevisionService(
    dataSource,
    clashRepo as unknown as Repository<ClashItem>,
    projectRepo as unknown as Repository<Project>,
    activityRepo as unknown as Repository<Activity>,
    scenarioRepo as unknown as Repository<Scenario>,
    outbox,
    undefined,
  );
  return { svc, clashStore, activityStore };
}

describe('ScheduleRevisionService.applyClashResolution (Req 2 typed links)', () => {
  it('writes linkedActivityBusinessKey + responsibleParty and appends an Activity version', async () => {
    const { svc, clashStore, activityStore } = buildService();
    const outcome = await svc.applyClashResolution({
      clashId: 'clash-1',
      optionIndex: 0,
      approvedBy: 'PD',
    });

    expect(outcome.revisedActivityKeys).toContain('A-CRIT');
    expect(outcome.revisionNumber).toBe(2);

    const clash = clashStore.get('clash-1')!;
    expect(clash.linkedActivityBusinessKey).toBe('A-CRIT');
    // Option scope "MEP re-route" → mechanical owns the re-route.
    expect(clash.responsibleParty).toBe('mechanical discipline');
    expect(clash.chosenOptionIndex).toBe(0);

    // Append-only: the original A-CRIT row was retired (isCurrent=false) and a
    // v2 clone became current.
    const critRows = activityStore.filter((a) => a.businessKey === 'A-CRIT');
    expect(critRows.some((a) => a.version === 2 && a.isCurrent)).toBe(true);
    expect(critRows.some((a) => a.version === 1 && !a.isCurrent)).toBe(true);
  });
});
