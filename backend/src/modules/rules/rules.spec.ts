import { AlertSeverity } from '../../common/enums';
import { Activity, Project, Report } from '../canonical/entities';
import { CostOverrunRule } from './rules/cost-overrun.rule';
import { ScheduleFinishSlippedRule } from './rules/schedule-finish-slipped.rule';
import { StaleReportingRule } from './rules/stale-reporting.rule';
import { DEFAULT_RULE_CONFIG, ProjectSnapshot } from './types';

const stubTrace = { ingestionRunId: 'run-1', sourceFileId: 'src-1', businessKey: 'X', version: 1, isCurrent: true, rawSource: {}, createdAt: new Date() };

function project(): Project {
  return Object.assign(new Project(), stubTrace, {
    id: 'p1', businessKey: 'P-1', name: 'Demo', dataDate: '2026-05-15',
    plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null,
    status: null, clientName: null, currency: null, budgetAtCompletion: null,
  });
}

function activity(overrides: Partial<Activity>): Activity {
  return Object.assign(new Activity(), stubTrace, {
    id: `a-${Math.random()}`, businessKey: 'A-1', projectId: 'p1',
    wbsCode: null, name: 'Task', activityType: null, status: null,
    plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null,
    plannedDurationDays: null, remainingDurationDays: null,
    plannedPctComplete: null, actualPctComplete: null,
    budgetedCost: null, actualCost: null,
    ...overrides,
  });
}

function emptySnapshot(over: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return { project: project(), activities: [], resources: [], assignments: [], reports: [], ...over };
}

describe('ScheduleFinishSlippedRule', () => {
  const rule = new ScheduleFinishSlippedRule();

  it('emits a CRITICAL alert with slip days and traceable refs', () => {
    const a = activity({ plannedFinish: '2026-04-30', actualFinish: '2026-05-12', name: 'Foundations' });
    const alerts = rule.evaluate(emptySnapshot({ activities: [a] }), DEFAULT_RULE_CONFIG);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].code).toBe('SCHEDULE_FINISH_SLIPPED');
    expect(alerts[0].severity).toBe(AlertSeverity.CRITICAL);
    expect(alerts[0].context.slipDays).toBe(12);
    expect(alerts[0].activityId).toBe(a.id);
    expect(alerts[0].ingestionRunId).toBe('run-1');
    expect(alerts[0].sourceFileId).toBe('src-1');
  });

  it('does not emit if actual finish equals planned finish', () => {
    const a = activity({ plannedFinish: '2026-04-30', actualFinish: '2026-04-30' });
    expect(rule.evaluate(emptySnapshot({ activities: [a] }), DEFAULT_RULE_CONFIG)).toHaveLength(0);
  });
});

describe('CostOverrunRule', () => {
  const rule = new CostOverrunRule();

  it('triggers when actual cost exceeds budget by the threshold ratio', () => {
    const a = activity({ budgetedCost: '100000', actualCost: '125000', name: 'Excavation' });
    const alerts = rule.evaluate(emptySnapshot({ activities: [a] }), DEFAULT_RULE_CONFIG);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].context.ratio).toBeCloseTo(1.25);
  });

  it('does not trigger within threshold', () => {
    const a = activity({ budgetedCost: '100000', actualCost: '105000' });
    expect(rule.evaluate(emptySnapshot({ activities: [a] }), DEFAULT_RULE_CONFIG)).toHaveLength(0);
  });
});

describe('StaleReportingRule', () => {
  const rule = new StaleReportingRule();

  it('flags when latest report is older than threshold from data date', () => {
    const p = project();
    p.dataDate = '2026-05-15';
    const r = Object.assign(new Report(), stubTrace, {
      id: 'rpt', projectId: 'p1', reportType: 'weekly', reportDate: '2026-04-15',
      periodStart: null, periodEnd: null, submittedBy: null,
      reportedPctComplete: null, narrative: null, metrics: {},
    });
    const alerts = rule.evaluate({ project: p, activities: [], resources: [], assignments: [], reports: [r] }, DEFAULT_RULE_CONFIG);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].context.ageDays).toBe(30);
  });
});
