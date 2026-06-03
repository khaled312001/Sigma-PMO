import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { DecisionReview, GovernanceDecision, User } from '../canonical/entities';
import { Role } from '../auth/roles.enum';
import { DecisionReviewService } from './decision-review.service';

function makeReviewRepo(): { create: jest.Mock; save: jest.Mock; find: jest.Mock } {
  return {
    create: jest.fn((e) => e),
    save: jest.fn(async (e) => ({ id: 'rev-1', ...e })),
    find: jest.fn().mockResolvedValue([]),
  };
}

function makeDecisionRepo(decision: GovernanceDecision | null): { findOne: jest.Mock } {
  return { findOne: jest.fn().mockResolvedValue(decision) };
}

const REAL_USER: User = {
  id: 'user-1',
  email: 'admin@sigma.local',
  displayName: 'Admin User',
  role: Role.SIGMA_ADMIN,
} as User;

const DECISION: GovernanceDecision = {
  id: 'dec-1',
  alertId: 'alert-1',
} as GovernanceDecision;

describe('DecisionReviewService', () => {
  it('rejects null actor (audit-trail invariant)', async () => {
    const service = new DecisionReviewService(
      makeReviewRepo() as unknown as Repository<DecisionReview>,
      makeDecisionRepo(DECISION) as unknown as Repository<GovernanceDecision>,
    );
    await expect(service.record('dec-1', 'approve', null, null))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects actor without id', async () => {
    const service = new DecisionReviewService(
      makeReviewRepo() as unknown as Repository<DecisionReview>,
      makeDecisionRepo(DECISION) as unknown as Repository<GovernanceDecision>,
    );
    const ghost = { ...REAL_USER, id: '' } as User;
    await expect(service.record('dec-1', 'approve', null, ghost))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects unknown action', async () => {
    const service = new DecisionReviewService(
      makeReviewRepo() as unknown as Repository<DecisionReview>,
      makeDecisionRepo(DECISION) as unknown as Repository<GovernanceDecision>,
    );
    await expect(service.record('dec-1', 'destroy', null, REAL_USER))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown decision', async () => {
    const service = new DecisionReviewService(
      makeReviewRepo() as unknown as Repository<DecisionReview>,
      makeDecisionRepo(null) as unknown as Repository<GovernanceDecision>,
    );
    await expect(service.record('missing', 'approve', null, REAL_USER))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('persists with authenticated actor (id + display)', async () => {
    const reviewRepo = makeReviewRepo();
    const service = new DecisionReviewService(
      reviewRepo as unknown as Repository<DecisionReview>,
      makeDecisionRepo(DECISION) as unknown as Repository<GovernanceDecision>,
    );
    const result = await service.record('dec-1', 'approve', 'looks good', REAL_USER);
    expect(reviewRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      decisionId: 'dec-1',
      alertId: 'alert-1',
      action: 'approve',
      comment: 'looks good',
      performedByUserId: 'user-1',
      performedByDisplay: 'Admin User',
    }));
    expect(result).toMatchObject({ performedByUserId: 'user-1', performedByDisplay: 'Admin User' });
  });

  it('falls back to email if displayName missing', async () => {
    const reviewRepo = makeReviewRepo();
    const service = new DecisionReviewService(
      reviewRepo as unknown as Repository<DecisionReview>,
      makeDecisionRepo(DECISION) as unknown as Repository<GovernanceDecision>,
    );
    const noName = { ...REAL_USER, displayName: undefined as unknown as string };
    await service.record('dec-1', 'acknowledge', null, noName);
    expect(reviewRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      performedByDisplay: 'admin@sigma.local',
    }));
  });

  describe('listForDecisionMany (batch endpoint)', () => {
    it('returns an empty object for an empty id list', async () => {
      const service = new DecisionReviewService(
        makeReviewRepo() as unknown as Repository<DecisionReview>,
        makeDecisionRepo(DECISION) as unknown as Repository<GovernanceDecision>,
      );
      const result = await service.listForDecisionMany([]);
      expect(result).toEqual({});
    });

    it('groups rows by decisionId and seeds missing ids with []', async () => {
      const reviewRepo = makeReviewRepo();
      reviewRepo.find.mockResolvedValueOnce([
        { id: 'r1', decisionId: 'd1', action: 'approve' },
        { id: 'r2', decisionId: 'd1', action: 'acknowledge' },
        { id: 'r3', decisionId: 'd2', action: 'reject' },
      ] as DecisionReview[]);
      const service = new DecisionReviewService(
        reviewRepo as unknown as Repository<DecisionReview>,
        makeDecisionRepo(DECISION) as unknown as Repository<GovernanceDecision>,
      );
      const result = await service.listForDecisionMany(['d1', 'd2', 'd3']);
      expect(Object.keys(result).sort()).toEqual(['d1', 'd2', 'd3']);
      expect(result.d1).toHaveLength(2);
      expect(result.d2).toHaveLength(1);
      expect(result.d3).toEqual([]);
    });
  });
});
