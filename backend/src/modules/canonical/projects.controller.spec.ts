import { Repository } from 'typeorm';

import { IngestionRun, Project, SourceFile } from './entities';
import { ProjectsController } from './projects.controller';
import { ProjectsScoresService } from './projects-scores.service';

/**
 * Task 9: `GET /projects?scenarioType=` filters by the demo archetype, and
 * every summary carries `scenarioType` as a first-class field.
 */
describe('ProjectsController.list (scenarioType filter)', () => {
  function build(rows: Partial<Project>[]) {
    const findCalls: Array<Record<string, unknown>> = [];
    const projects = {
      find: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        findCalls.push(where);
        const st = where.scenarioType;
        return (st ? rows.filter((r) => r.scenarioType === st) : rows) as Project[];
      }),
    };
    const scores = { scoreAll: jest.fn(async () => new Map()) } as unknown as ProjectsScoresService;
    const controller = new ProjectsController(
      projects as unknown as Repository<Project>,
      {} as unknown as Repository<SourceFile>,
      {} as unknown as Repository<IngestionRun>,
      scores,
    );
    return { controller, findCalls };
  }

  const ROWS: Partial<Project>[] = [
    { id: '1', businessKey: 'P-1000', name: 'Tower', status: 'active', clientName: null, dataDate: null, scenarioType: 'new-from-sketch' },
    { id: '2', businessKey: 'P-STALL', name: 'Stalled', status: 'active', clientName: null, dataDate: null, scenarioType: 'stalled' },
    { id: '3', businessKey: 'P-DISP', name: 'Disputed', status: 'active', clientName: null, dataDate: null, scenarioType: 'disputed' },
  ];

  it('returns all projects (with scenarioType) when no filter is given', async () => {
    const { controller, findCalls } = build(ROWS);
    const res = await controller.list();
    expect(res).toHaveLength(3);
    expect(res.map((r) => r.scenarioType)).toEqual(['new-from-sketch', 'stalled', 'disputed']);
    expect(findCalls[0]).not.toHaveProperty('scenarioType');
  });

  it('filters by scenarioType=disputed', async () => {
    const { controller, findCalls } = build(ROWS);
    const res = await controller.list('disputed');
    expect(res).toHaveLength(1);
    expect(res[0].businessKey).toBe('P-DISP');
    expect(findCalls[0].scenarioType).toBe('disputed');
  });
});
