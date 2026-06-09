import { Activity, Project } from '../canonical/entities';
import { XerWriterService } from './xer-writer.service';

const traceStub = {
  ingestionRunId: 'run-1',
  sourceFileId: 'src-1',
  businessKey: 'demo',
  version: 1,
  isCurrent: true,
  rawSource: {},
  createdAt: new Date(),
};

function project(): Project {
  return Object.assign(new Project(), traceStub, {
    id: '00000000-0000-0000-0000-000000000001',
    businessKey: 'P-7000',
    name: 'Sigma Tower — Main Construction',
    plannedStart: '2026-01-05',
    plannedFinish: '2026-12-18',
    actualStart: null,
    actualFinish: null,
    status: 'Active',
    clientName: 'Sigma Holdings',
    currency: 'AED',
    budgetAtCompletion: '4200000',
    dataDate: '2026-06-09',
  });
}

function activity(over: Partial<Activity>): Activity {
  return Object.assign(new Activity(), traceStub, {
    id: `a-${Math.random()}`,
    businessKey: 'A-1',
    projectId: 'p1',
    wbsCode: 'WBS.1.1',
    name: 'Foundations',
    activityType: 'foundation',
    status: 'NotStarted',
    plannedStart: '2026-02-01',
    plannedFinish: '2026-03-15',
    actualStart: null,
    actualFinish: null,
    plannedDurationDays: 42,
    remainingDurationDays: 42,
    plannedPctComplete: 0,
    actualPctComplete: 0,
    budgetedCost: '500000',
    actualCost: null,
    ...over,
  });
}

describe('XerWriterService', () => {
  const svc = new XerWriterService();

  it('emits a valid ERMHDR header and %E terminator', () => {
    const result = svc.write({ project: project(), activities: [] });
    expect(result.text.startsWith('ERMHDR\t')).toBe(true);
    expect(result.text.trimEnd().endsWith('%E\t0')).toBe(true);
    expect(result.text).toContain('UTF-8');
    expect(result.text).toContain('AED');
  });

  it('emits PROJECT, PROJWBS, and TASK tables in order', () => {
    const activities = [
      activity({ name: 'Site Mobilisation', wbsCode: 'WBS.1' }),
      activity({ name: 'Bulk Excavation', wbsCode: 'WBS.2', plannedDurationDays: 20 }),
      activity({ name: 'Basement RC', wbsCode: 'WBS.2' }),
    ];
    const result = svc.write({ project: project(), activities });
    const idx = (s: string) => result.text.indexOf(s);
    expect(idx('%T\tPROJECT')).toBeGreaterThan(0);
    expect(idx('%T\tPROJWBS')).toBeGreaterThan(idx('%T\tPROJECT'));
    expect(idx('%T\tTASK')).toBeGreaterThan(idx('%T\tPROJWBS'));
  });

  it('groups WBS codes uniquely with a root WBS node', () => {
    const activities = [
      activity({ wbsCode: 'WBS.A' }),
      activity({ wbsCode: 'WBS.A' }),
      activity({ wbsCode: 'WBS.B' }),
      activity({ wbsCode: 'WBS.C' }),
    ];
    const result = svc.write({ project: project(), activities });
    expect(result.rowCounts.wbs).toBe(4); // root + 3 distinct codes
    expect(result.rowCounts.task).toBe(4);
  });

  it('emits one TASK row per activity', () => {
    const activities = Array.from({ length: 5 }, (_, i) =>
      activity({ name: `Task ${i + 1}`, plannedDurationDays: 10 + i }),
    );
    const result = svc.write({ project: project(), activities });
    expect(result.rowCounts.task).toBe(5);
    const taskSection = result.text.slice(result.text.indexOf('%T\tTASK'));
    const rowCount = (taskSection.match(/^%R\t/gm) ?? []).length;
    expect(rowCount).toBe(5);
  });

  it('falls back to a single root WBS when no activity carries a wbsCode', () => {
    const activities = [
      activity({ wbsCode: null, name: 'Untyped 1' }),
      activity({ wbsCode: null, name: 'Untyped 2' }),
    ];
    const result = svc.write({ project: project(), activities });
    expect(result.rowCounts.wbs).toBe(1);
    expect(result.warnings).toContain('No wbsCode found on any activity — emitting a single ROOT WBS node.');
  });

  it('maps activity status to a P6 task status code', () => {
    const result = svc.write({
      project: project(),
      activities: [
        activity({ name: 'Done', status: 'Completed', actualFinish: '2026-03-01' }),
        activity({ name: 'In progress', status: 'InProgress', actualStart: '2026-02-01' }),
        activity({ name: 'Not started', status: 'NotStarted' }),
      ],
    });
    expect(result.text).toContain('TK_Complete');
    expect(result.text).toContain('TK_Active');
    expect(result.text).toContain('TK_NotStart');
  });

  it('escapes tab + newline in activity names so row integrity holds', () => {
    const result = svc.write({
      project: project(),
      activities: [activity({ name: 'Bad\tName\nWith\rWhitespace' })],
    });
    expect(result.text).not.toMatch(/Bad\tName\nWith\r/);
    expect(result.text).toContain('Bad Name With Whitespace');
  });

  it('is deterministic — same input → byte-identical output', () => {
    const activities = [
      activity({ name: 'A', wbsCode: 'WBS.X' }),
      activity({ name: 'B', wbsCode: 'WBS.X' }),
    ];
    const first = svc.write({ project: project(), activities });
    const second = svc.write({ project: project(), activities });
    expect(first.text).toBe(second.text);
    expect(first.buffer.equals(second.buffer)).toBe(true);
  });

  it('emits an authored-by line in ERMHDR', () => {
    const result = svc.write({
      project: project(),
      activities: [],
      authoredBy: 'planner-p6-25yr',
    });
    expect(result.text).toContain('planner-p6-25yr');
  });
});
