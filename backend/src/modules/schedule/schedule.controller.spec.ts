import { CpmResult, CpmService } from './cpm.service';
import { RecoveryPlanService, RecoveryProposal } from './recovery-plan.service';
import { ScheduleController } from './schedule.controller';

describe('ScheduleController', () => {
  it('GET /projects/:projectKey/cpm delegates to CpmService.solve', async () => {
    const result = { projectKey: 'P-1000', hasLogic: true, projectDurationDays: 20, activities: [], criticalPath: ['A'] } as CpmResult;
    const cpm = { solve: jest.fn(async () => result) } as unknown as CpmService;
    const recovery = {} as unknown as RecoveryPlanService;
    const controller = new ScheduleController(cpm, recovery);
    const res = await controller.solveCpm('P-1000');
    expect(cpm.solve).toHaveBeenCalledWith('P-1000');
    expect(res.criticalPath).toEqual(['A']);
  });

  it('POST /schedule/recovery/propose delegates to RecoveryPlanService.propose', async () => {
    const proposal = { scenarioId: 'scn-1', projectKey: 'P-1000', options: [] } as unknown as RecoveryProposal;
    const cpm = {} as unknown as CpmService;
    const recovery = { propose: jest.fn(async () => proposal) } as unknown as RecoveryPlanService;
    const controller = new ScheduleController(cpm, recovery);
    const res = await controller.proposeRecovery({ projectKey: 'P-1000', targetFinishIso: '2026-12-01' });
    expect(recovery.propose).toHaveBeenCalledWith('P-1000', '2026-12-01');
    expect(res.scenarioId).toBe('scn-1');
  });
});
