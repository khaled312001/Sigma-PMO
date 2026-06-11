import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { Alert, DecisionReview, GovernanceDecision, User } from '../canonical/entities';
import { Role } from '../auth/roles.enum';
import { computeChainState, DecisionReviewService } from './decision-review.service';

/**
 * Dual-approval chain (escalation rule): critical-severity decisions require
 * TWO approvals by DISTINCT actors. These specs exercise the chain at the
 * service level with fake repos (mirrors decision-review.service.spec.ts).
 */

const DECISION: GovernanceDecision = { id: 'dec-1', alertId: 'alert-1' } as GovernanceDecision;

const ALICE: User = {
  id: 'user-alice',
  email: 'alice@sigma.local',
  displayName: 'Alice',
  role: Role.SIGMA_ADMIN,
} as User;

const BOB: User = {
  id: 'user-bob',
  email: 'bob@sigma.local',
  displayName: 'Bob',
  role: Role.SIGMA_ADMIN,
} as User;

/** Review repo whose `find` returns whatever the running test seeded. */
function makeReviewRepo(store: DecisionReview[]): Repository<DecisionReview> {
  return {
    create: jest.fn((e) => e),
    save: jest.fn(async (e: Partial<DecisionReview>) => {
      const row = { id: `rev-${store.length + 1}`, createdAt: new Date(), ...e } as DecisionReview;
      store.push(row);
      return row;
    }),
    // The service calls find for prior approvals (filter by action) and for all
    // reviews of the decision. We honour the action filter when present.
    find: jest.fn(async (opts?: { where?: { action?: string } }) => {
      const action = opts?.where?.action;
      return action ? store.filter((r) => r.action === action) : [...store];
    }),
  } as unknown as Repository<DecisionReview>;
}

function makeDecisionRepo(): Repository<GovernanceDecision> {
  return { findOne: jest.fn().mockResolvedValue(DECISION) } as unknown as Repository<GovernanceDecision>;
}

function makeAlertRepo(severity: 'info' | 'warning' | 'critical'): Repository<Alert> {
  return {
    findOne: jest.fn().mockResolvedValue({ id: 'alert-1', severity } as Alert),
  } as unknown as Repository<Alert>;
}

describe('Dual-approval chain (critical decisions)', () => {
  it('first approve on a critical decision → awaiting-second-approval', async () => {
    const store: DecisionReview[] = [];
    const service = new DecisionReviewService(
      makeReviewRepo(store),
      makeDecisionRepo(),
      makeAlertRepo('critical'),
    );
    const r = await service.record('dec-1', 'approve', null, ALICE);
    expect(r.requiresDualApproval).toBe(true);
    expect(r.chainState).toBe('awaiting-second-approval');
    expect(r.approvalsRemaining).toBe(1);
    expect(r.approvals).toHaveLength(1);
    expect(r.approvals[0].performedByDisplay).toBe('Alice');
  });

  it('same-actor second approve → 409 Conflict', async () => {
    const store: DecisionReview[] = [];
    const service = new DecisionReviewService(
      makeReviewRepo(store),
      makeDecisionRepo(),
      makeAlertRepo('critical'),
    );
    await service.record('dec-1', 'approve', null, ALICE);
    await expect(service.record('dec-1', 'approve', null, ALICE))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('second approve by a DISTINCT actor → approved', async () => {
    const store: DecisionReview[] = [];
    const service = new DecisionReviewService(
      makeReviewRepo(store),
      makeDecisionRepo(),
      makeAlertRepo('critical'),
    );
    await service.record('dec-1', 'approve', null, ALICE);
    const second = await service.record('dec-1', 'approve', null, BOB);
    expect(second.chainState).toBe('approved');
    expect(second.approvalsRemaining).toBe(0);
    expect(second.approvals).toHaveLength(2);
  });

  it('non-critical decision reaches approved on a single approve', async () => {
    const store: DecisionReview[] = [];
    const service = new DecisionReviewService(
      makeReviewRepo(store),
      makeDecisionRepo(),
      makeAlertRepo('warning'),
    );
    const r = await service.record('dec-1', 'approve', null, ALICE);
    expect(r.requiresDualApproval).toBe(false);
    expect(r.chainState).toBe('approved');
    expect(r.approvalsRemaining).toBe(0);
  });
});

describe('computeChainState (pure)', () => {
  function review(over: Partial<DecisionReview>): DecisionReview {
    return {
      id: `r-${Math.random().toString(36).slice(2, 7)}`,
      decisionId: 'dec-1',
      alertId: 'alert-1',
      action: 'approve',
      performedByUserId: 'u1',
      performedByDisplay: 'U1',
      comment: null,
      createdAt: new Date(),
      ...over,
    } as DecisionReview;
  }

  it('empty reviews → pending (2 remaining when dual required)', () => {
    expect(computeChainState([], true)).toMatchObject({ state: 'pending', approvalsRemaining: 2 });
    expect(computeChainState([], false)).toMatchObject({ state: 'pending', approvalsRemaining: 1 });
  });

  it('a single approve on a dual-required decision → awaiting-second-approval', () => {
    const r = computeChainState([review({ performedByUserId: 'u1', performedByDisplay: 'U1' })], true);
    expect(r.state).toBe('awaiting-second-approval');
    expect(r.approvalsRemaining).toBe(1);
  });

  it('two distinct approvers on a dual-required decision → approved', () => {
    const r = computeChainState(
      [
        review({ performedByUserId: 'u1', performedByDisplay: 'U1' }),
        review({ performedByUserId: 'u2', performedByDisplay: 'U2' }),
      ],
      true,
    );
    expect(r.state).toBe('approved');
    expect(r.approvalsRemaining).toBe(0);
  });

  it('two reviews by the SAME actor count as one distinct approval', () => {
    const r = computeChainState(
      [
        review({ performedByUserId: 'u1', performedByDisplay: 'U1' }),
        review({ performedByUserId: 'u1', performedByDisplay: 'U1' }),
      ],
      true,
    );
    expect(r.state).toBe('awaiting-second-approval');
    expect(r.approvals).toHaveLength(1);
  });

  it('latest reject is terminal regardless of prior approvals', () => {
    const r = computeChainState(
      [
        review({ action: 'reject', createdAt: new Date(Date.now() + 1000) }),
        review({ action: 'approve', createdAt: new Date(Date.now()) }),
      ],
      true,
    );
    expect(r.state).toBe('rejected');
  });
});
