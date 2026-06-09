import { AlertSeverity } from '../../../common/enums';
import { Activity, Project } from '../../canonical/entities';
import { BaselineDurationOutlierRule } from './baseline-duration-outlier.rule';
import { DEFAULT_RULE_CONFIG, ProjectSnapshot } from '../types';

const stubTrace = {
  ingestionRunId: 'run-1',
  sourceFileId: 'src-1',
  businessKey: 'X',
  version: 1,
  isCurrent: true,
  rawSource: {},
  createdAt: new Date(),
};

function project(): Project {
  return Object.assign(new Project(), stubTrace, {
    id: 'p1',
    businessKey: 'P-1',
    name: 'Demo',
    dataDate: '2026-05-15',
    plannedStart: null,
    plannedFinish: null,
    actualStart: null,
    actualFinish: null,
    status: null,
    clientName: null,
    currency: null,
    budgetAtCompletion: null,
  });
}

function activity(overrides: Partial<Activity>): Activity {
  return Object.assign(new Activity(), stubTrace, {
    id: `a-${Math.random()}`,
    businessKey: 'A-1',
    projectId: 'p1',
    wbsCode: null,
    name: 'Task',
    activityType: null,
    status: null,
    plannedStart: null,
    plannedFinish: null,
    actualStart: null,
    actualFinish: null,
    plannedDurationDays: null,
    remainingDurationDays: null,
    plannedPctComplete: null,
    actualPctComplete: null,
    budgetedCost: null,
    actualCost: null,
    ...overrides,
  });
}

function snapshot(activities: Activity[]): ProjectSnapshot {
  return { project: project(), activities, resources: [], assignments: [], reports: [] };
}

/** A peer group of N activities around a target duration with optional outliers. */
function peerGroup(
  type: string,
  medianDurations: number[],
  outliers: { duration: number; name: string }[] = [],
): Activity[] {
  return [
    ...medianDurations.map((d, i) => activity({ activityType: type, plannedDurationDays: d, name: `${type}-${i}` })),
    ...outliers.map((o) => activity({ activityType: type, plannedDurationDays: o.duration, name: o.name })),
  ];
}

describe('BaselineDurationOutlierRule', () => {
  const rule = new BaselineDurationOutlierRule();

  it('flags a padded activity (≥2× median) as WARNING', () => {
    // median of [10,10,10,10,10] = 10; padded threshold = 20
    const peers = peerGroup('mep-roughin', [10, 10, 10, 10, 10], [
      { duration: 60, name: 'MEP rough-in Block C' },
    ]);
    const alerts = rule.evaluate(snapshot(peers), DEFAULT_RULE_CONFIG);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].code).toBe('BASELINE_DURATION_OUTLIER');
    expect(alerts[0].severity).toBe(AlertSeverity.WARNING);
    expect(alerts[0].summary).toContain('padded');
    expect(alerts[0].summary).toContain('MEP rough-in Block C');
    expect(alerts[0].context.ratio).toBeCloseTo(6, 1);
  });

  it('flags an optimistic activity (≤0.5× median) as INFO', () => {
    // median of [20,20,20,20,20] = 20; optimistic threshold = 10
    const peers = peerGroup('concrete-pour', [20, 20, 20, 20, 20], [
      { duration: 5, name: 'Concrete pour zone X' },
    ]);
    const alerts = rule.evaluate(snapshot(peers), DEFAULT_RULE_CONFIG);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe(AlertSeverity.INFO);
    expect(alerts[0].summary).toContain('optimistic');
  });

  it('does not flag activities inside the band', () => {
    const peers = peerGroup('formwork', [10, 10, 10, 10, 10], [
      { duration: 15, name: 'normal' },
      { duration: 7, name: 'normal-2' },
    ]);
    const alerts = rule.evaluate(snapshot(peers), DEFAULT_RULE_CONFIG);
    expect(alerts).toHaveLength(0);
  });

  it('skips groups smaller than MIN_GROUP_SIZE (5)', () => {
    // 3 peers + 1 outlier = 4 activities total — below the 5-member threshold,
    // so no statistical confidence and even a clear outlier is ignored.
    const peers = peerGroup('rebar', [10, 10, 10], [
      { duration: 100, name: 'Suspicious but lonely' },
    ]);
    const alerts = rule.evaluate(snapshot(peers), DEFAULT_RULE_CONFIG);
    expect(alerts).toHaveLength(0);
  });

  it('skips activities with actualStart set (post-baseline)', () => {
    const peers = [
      ...peerGroup('blockwork', [10, 10, 10, 10, 10]),
      activity({
        activityType: 'blockwork',
        plannedDurationDays: 40,
        actualStart: '2026-05-01',
        name: 'Already started',
      }),
    ];
    const alerts = rule.evaluate(snapshot(peers), DEFAULT_RULE_CONFIG);
    expect(alerts).toHaveLength(0);
  });

  it('skips activities with missing activityType', () => {
    const peers = peerGroup('plaster', [10, 10, 10, 10, 10]);
    peers.push(activity({ activityType: null, plannedDurationDays: 200, name: 'Untyped outlier' }));
    const alerts = rule.evaluate(snapshot(peers), DEFAULT_RULE_CONFIG);
    expect(alerts).toHaveLength(0);
  });

  it('handles multiple groups independently', () => {
    // group A — padded; group B — clean
    const peers = [
      ...peerGroup('group-a', [10, 10, 10, 10, 10], [{ duration: 30, name: 'A-pad' }]),
      ...peerGroup('group-b', [20, 20, 20, 20, 20]),
    ];
    const alerts = rule.evaluate(snapshot(peers), DEFAULT_RULE_CONFIG);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].summary).toContain('A-pad');
  });

  it('carries source traceability through to the alert', () => {
    const peers = peerGroup('finishes', [10, 10, 10, 10, 10], [{ duration: 30, name: 'Outlier' }]);
    const target = peers.find((a) => a.name === 'Outlier');
    if (target) {
      target.ingestionRunId = 'run-xyz';
      target.sourceFileId = 'src-xyz';
    }
    const alerts = rule.evaluate(snapshot(peers), DEFAULT_RULE_CONFIG);
    expect(alerts[0].ingestionRunId).toBe('run-xyz');
    expect(alerts[0].sourceFileId).toBe('src-xyz');
  });
});
