import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { Alert, DecisionReview, GovernanceDecision, User } from '../canonical/entities';
import { Role } from '../auth/roles.enum';
import { DecisionReviewService } from './decision-review.service';

/**
 * R7 NO-auto-approval guard: financial / contractual / safety decisions can
 * NEVER be auto-approved on a single signature — they require TWO approvals by
 * DISTINCT actors, exactly like critical-severity decisions, EVEN when the
 * triggering alert is NOT critical. Mirrors dual-approval-chain.spec.ts but
 * drives the quorum off the decision's category instead of alert severity.
 */

const ALICE: User = { id: 'user-alice', email: 'alice@sigma.local', displayName: 'Alice', role: Role.SIGMA_ADMIN } as User;
const BOB: User = { id: 'user-bob', email: 'bob@sigma.local', displayName: 'Bob', role: Role.SIGMA_ADMIN } as User;

function makeReviewRepo(store: DecisionReview[]): Repository<DecisionReview> {
  return {
    create: jest.fn((e) => e),
    save: jest.fn(async (e: Partial<DecisionReview>) => {
      const row = { id: `rev-${store.length + 1}`, createdAt: new Date(), ...e } as DecisionReview;
      store.push(row);
      return row;
    }),
    find: jest.fn(async (opts?: { where?: { action?: string } }) => {
      const action = opts?.where?.action;
      return action ? store.filter((r) => r.action === action) : [...store];
    }),
  } as unknown as Repository<DecisionReview>;
}

/** A non-critical (warning) alert — so any dual-approval comes from the CATEGORY.
 * Code defaults to a financial one; pass a neutral code to test clause-driven
 * derivation in isolation. */
function makeAlertRepo(code = 'COST_OVERRUN', severity = 'warning'): Repository<Alert> {
  return {
    findOne: jest.fn().mockResolvedValue({ id: 'alert-1', code, severity } as Alert),
  } as unknown as Repository<Alert>;
}

function makeDecisionRepo(category: string | null, fidicClause: string | null = null): Repository<GovernanceDecision> {
  return {
    findOne: jest.fn().mockResolvedValue({ id: 'dec-1', alertId: 'alert-1', category, fidicClause } as GovernanceDecision),
  } as unknown as Repository<GovernanceDecision>;
}

describe('R7 sensitive-category dual approval (non-critical severity)', () => {
  for (const category of ['financial', 'contractual', 'safety'] as const) {
    describe(`category=${category}`, () => {
      it('first approve → awaiting-second-approval + autoApprovalBlocked=true', async () => {
        const store: DecisionReview[] = [];
        const service = new DecisionReviewService(
          makeReviewRepo(store),
          makeDecisionRepo(category),
          makeAlertRepo(),
        );
        const r = await service.record('dec-1', 'approve', null, ALICE);
        expect(r.autoApprovalBlocked).toBe(true);
        expect(r.requiresDualApproval).toBe(true);
        expect(r.chainState).toBe('awaiting-second-approval');
        expect(r.approvalsRemaining).toBe(1);
        expect(r.category).toBe(category);
      });

      it('same-actor second approve → 409 Conflict (cannot self-quorum)', async () => {
        const store: DecisionReview[] = [];
        const service = new DecisionReviewService(
          makeReviewRepo(store),
          makeDecisionRepo(category),
          makeAlertRepo(),
        );
        await service.record('dec-1', 'approve', null, ALICE);
        await expect(service.record('dec-1', 'approve', null, ALICE))
          .rejects.toBeInstanceOf(ConflictException);
      });

      it('second approve by a DISTINCT actor → approved', async () => {
        const store: DecisionReview[] = [];
        const service = new DecisionReviewService(
          makeReviewRepo(store),
          makeDecisionRepo(category),
          makeAlertRepo(),
        );
        await service.record('dec-1', 'approve', null, ALICE);
        const second = await service.record('dec-1', 'approve', null, BOB);
        expect(second.chainState).toBe('approved');
        expect(second.approvalsRemaining).toBe(0);
        expect(second.approvals).toHaveLength(2);
      });
    });
  }

  it('derives contractual from a FIDIC clause on a legacy (null-category) row and requires dual approval', async () => {
    const store: DecisionReview[] = [];
    // Neutral alert code ('OBSERVATION' matches no financial/safety family), so
    // the FIDIC clause alone drives the contractual classification.
    const service = new DecisionReviewService(
      makeReviewRepo(store),
      makeDecisionRepo(null, 'Sub-Clause 20.1'),
      makeAlertRepo('OBSERVATION'),
    );
    const r = await service.record('dec-1', 'approve', null, ALICE);
    expect(r.category).toBe('contractual');
    expect(r.autoApprovalBlocked).toBe(true);
    expect(r.chainState).toBe('awaiting-second-approval');
  });

  it('an operational decision on a non-critical alert still approves on a single signature (not blocked)', async () => {
    const store: DecisionReview[] = [];
    const service = new DecisionReviewService(
      makeReviewRepo(store),
      makeDecisionRepo('operational'),
      makeAlertRepo(),
    );
    const r = await service.record('dec-1', 'approve', null, ALICE);
    expect(r.autoApprovalBlocked).toBe(false);
    expect(r.requiresDualApproval).toBe(false);
    expect(r.chainState).toBe('approved');
  });
});
