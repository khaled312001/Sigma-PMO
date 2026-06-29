import { ObjectLiteral, Repository } from 'typeorm';

import { AlertSeverity } from '../../common/enums';
import {
  Alert,
  Claim,
  ClaimEvidenceLink,
  GovernanceDecision,
  Project,
} from '../canonical/entities';
import { AgentRegistry } from '../agents/agent.registry';
import { OutboxService } from '../outbox/outbox.service';
import { ClaimsAgentService } from './claims-agent.service';
import { DelayAnalysisService } from './delay-analysis.service';

/**
 * ClaimsAgentService — the L6 claims agent now writes ClaimEvidenceLink rows
 * (Mr. Ayham acceptance 2026-06-28). We run the agent over a project with a
 * SCHEDULE_BEHIND_PLAN alert + a governance decision and assert it persists the
 * alert/decision/fidic_clause links onto the identified claim. The audit/outbox
 * machinery is stubbed so we exercise the real process() path through run().
 */

function findRepo<T extends ObjectLiteral>(rows: T[]): Repository<T> {
  return {
    find: jest.fn(async () => rows),
    findOne: jest.fn(async () => rows[0] ?? null),
    create: jest.fn((init: Partial<T>) => ({ ...init }) as T),
    save: jest.fn(async (e: T) => e),
  } as unknown as Repository<T>;
}

describe('ClaimsAgentService — auto-derived ClaimEvidenceLink write-path', () => {
  function build() {
    const project = { id: 'proj-uuid', businessKey: 'P-1000', isCurrent: true } as unknown as Project;
    const alert = {
      id: 'alert-1',
      projectId: 'proj-uuid',
      code: 'SCHEDULE_FINISH_SLIPPED',
      severity: AlertSeverity.CRITICAL,
      context: { deltaDays: 12, activityKey: 'A-100' },
    } as unknown as Alert;
    const decision = {
      id: 'gd-1',
      alertId: 'alert-1',
      responsibleParty: 'client',
      fidicClause: 'FIDIC 8.5',
    } as unknown as GovernanceDecision;

    // The claim store: starts empty, upsert saves into it; assign an id on save.
    const claimStore: Claim[] = [];
    const claimsRepo = {
      find: jest.fn(async () => claimStore),
      findOne: jest.fn(async () => null), // always "new" claim each run
      create: jest.fn((init: Partial<Claim>) => ({ ...init }) as Claim),
      save: jest.fn(async (c: Claim) => {
        if (!c.id) c.id = `claim-${claimStore.length + 1}`;
        claimStore.push(c);
        return c;
      }),
    } as unknown as Repository<Claim>;

    const linkStore: ClaimEvidenceLink[] = [];
    const linksRepo = {
      find: jest.fn(async () => linkStore),
      findOne: jest.fn(async () => null),
      create: jest.fn((init: Partial<ClaimEvidenceLink>) => ({ ...init }) as ClaimEvidenceLink),
      save: jest.fn(async (rows: ClaimEvidenceLink | ClaimEvidenceLink[]) => {
        const arr = Array.isArray(rows) ? rows : [rows];
        for (const r of arr) linkStore.push(r);
        return rows;
      }),
    } as unknown as Repository<ClaimEvidenceLink>;

    const executions = {
      create: jest.fn((init: ObjectLiteral) => ({ ...init })),
      save: jest.fn(async (e: ObjectLiteral) => {
        if (!e.id) e.id = 'exec-1';
        return e;
      }),
    } as unknown as Repository<ObjectLiteral>;
    const confidences = {
      create: jest.fn((init: ObjectLiteral) => ({ ...init })),
      save: jest.fn(async (e: ObjectLiteral) => ({ ...e, id: 'cs-1' })),
    } as unknown as Repository<ObjectLiteral>;
    const outbox = { push: jest.fn(async () => undefined) } as unknown as OutboxService;
    const registry = { register: jest.fn() } as unknown as AgentRegistry;

    const agent = new ClaimsAgentService(
      executions as never,
      confidences as never,
      outbox,
      findRepo([project]),
      findRepo([alert]),
      claimsRepo,
      linksRepo,
      findRepo([decision]),
      new DelayAnalysisService(),
      registry,
    );
    return { agent, linkStore, claimStore };
  }

  it('writes alert + decision + fidic_clause links for an identified EOT claim', async () => {
    const { agent, linkStore, claimStore } = build();
    await agent.run({ nodeBusinessKey: 'P-1000', triggeredBy: 'test' });

    expect(claimStore.length).toBeGreaterThanOrEqual(1);
    const types = linkStore.map((l) => l.linkType);
    expect(types).toContain('alert');
    expect(types).toContain('decision');
    expect(types).toContain('fidic_clause');

    const alertLink = linkStore.find((l) => l.linkType === 'alert');
    expect(alertLink?.targetTable).toBe('alert');
    expect(alertLink?.targetId).toBe('alert-1');
    expect(alertLink?.claimId).toBe(claimStore[0].id);

    const fidicLink = linkStore.find((l) => l.linkType === 'fidic_clause');
    expect(fidicLink?.targetId).toBe('FIDIC 8.5');
  });
});
