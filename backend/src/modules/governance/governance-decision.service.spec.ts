import { Repository } from 'typeorm';

import { Alert, GovernanceDecision, GovernancePolicy } from '../canonical/entities';
import { AlertSeverity } from '../../common/enums';
import { DEFAULT_GOVERNANCE_POLICY } from './default-policy';
import { GovernanceDecisionService } from './governance-decision.service';
import { GovernancePolicyService } from './governance-policy.service';

function makeAlertRepo(): Repository<Alert> {
  return { find: jest.fn() } as unknown as Repository<Alert>;
}
function makeDecisionRepo(): Repository<GovernanceDecision> {
  return {
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((e) => ({ ...e })),
    save: jest.fn(async (rows) => rows),
  } as unknown as Repository<GovernanceDecision>;
}
function makePolicyService(): GovernancePolicyService {
  const policy = {
    id: 'pol-1',
    version: 1,
    config: DEFAULT_GOVERNANCE_POLICY as unknown as Record<string, unknown>,
  } as GovernancePolicy;
  return { resolveFor: jest.fn().mockResolvedValue(policy) } as unknown as GovernancePolicyService;
}

function alert(over: Partial<Alert> = {}): Alert {
  return {
    id: `alert-${Math.random().toString(36).slice(2, 8)}`,
    code: 'SCHEDULE_FINISH_SLIPPED',
    severity: AlertSeverity.CRITICAL,
    summary: 'Sample alert',
    projectId: 'p1',
    activityId: 'a1',
    resourceId: null,
    assignmentId: null,
    reportId: null,
    ingestionRunId: 'run-1',
    sourceFileId: 'src-1',
    ruleEvaluationId: 'eval-1',
    context: { slipDays: 3 },
    createdAt: new Date(),
    ...over,
  } as Alert;
}

describe('GovernanceDecisionService', () => {
  let alertRepo: Repository<Alert>;
  let decisionRepo: Repository<GovernanceDecision>;
  let policyService: GovernancePolicyService;
  let service: GovernanceDecisionService;

  beforeEach(() => {
    alertRepo = makeAlertRepo();
    decisionRepo = makeDecisionRepo();
    policyService = makePolicyService();
    service = new GovernanceDecisionService(policyService, alertRepo, decisionRepo);
  });

  it('produces zero decisions for an empty alerts set', async () => {
    const r = await service.decideForAlerts([], null);
    expect(r.decisionCount).toBe(0);
  });

  it('maps SCHEDULE_FINISH_SLIPPED via the default policy', async () => {
    const r = await service.decideForAlerts([alert()], null);
    expect(r.decisionCount).toBe(1);
    expect(r.byParty).toEqual({ contractor: 1 });
    expect(decisionRepo.save).toHaveBeenCalled();
    const saved = (decisionRepo.save as jest.Mock).mock.calls[0][0][0];
    expect(saved.fidicClause).toBe('Sub-Clause 8.5 / 20.1');
    expect(saved.escalationLevel).toBe('L3'); // critical → L3 immediately
    expect(saved.notifyParties).toEqual(['client', 'sigma']);
    expect(saved.interventions.length).toBeGreaterThan(0);
  });

  it('escalates warning alerts only after the age threshold elapses', async () => {
    const day = 24 * 60 * 60 * 1000;
    const recent = alert({ severity: AlertSeverity.WARNING, code: 'SCHEDULE_BEHIND_PLAN', createdAt: new Date() });
    const old = alert({ severity: AlertSeverity.WARNING, code: 'SCHEDULE_BEHIND_PLAN', createdAt: new Date(Date.now() - 5 * day) });

    const r1 = await service.decideForAlerts([recent], null);
    const saved1 = (decisionRepo.save as jest.Mock).mock.calls[0][0][0];
    expect(saved1.escalationLevel).toBe('L1'); // not yet at threshold (3d)

    const r2 = await service.decideForAlerts([old], null);
    const saved2 = (decisionRepo.save as jest.Mock).mock.calls[1][0][0];
    expect(saved2.escalationLevel).toBe('L2'); // 5d ≥ 3d threshold
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
  });

  it('handles unknown rule codes by falling back to shared/L1 + empty interventions', async () => {
    const unknown = alert({ code: 'NEW_RULE', severity: AlertSeverity.INFO });
    const r = await service.decideForAlerts([unknown], null);
    expect(r.decisionCount).toBe(1);
    const saved = (decisionRepo.save as jest.Mock).mock.calls[0][0][0];
    expect(saved.responsibleParty).toBe('shared');
    expect(saved.fidicClause).toBeNull();
    expect(saved.interventions).toEqual([]);
  });
});
