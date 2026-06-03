import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DecisionReview, GovernanceDecision, User } from '../canonical/entities';

const ALLOWED_ACTIONS = new Set(['approve', 'reject', 'acknowledge']);

@Injectable()
export class DecisionReviewService {
  constructor(
    @InjectRepository(DecisionReview) private readonly reviews: Repository<DecisionReview>,
    @InjectRepository(GovernanceDecision) private readonly decisions: Repository<GovernanceDecision>,
  ) {}

  async record(
    decisionId: string,
    action: string,
    comment: string | null,
    actor: User | null,
  ): Promise<DecisionReview> {
    if (!ALLOWED_ACTIONS.has(action)) {
      throw new BadRequestException(`Unknown action "${action}"; allowed: approve | reject | acknowledge`);
    }
    // Audit-trail integrity: every review must attribute to a real actor.
    // The controller's @RequiresCapability is the primary gate; this throws
    // if a future code path ever tries to record an anonymous review.
    if (!actor || !actor.id) {
      throw new UnauthorizedException('decision review requires an authenticated actor');
    }
    const decision = await this.decisions.findOne({ where: { id: decisionId } });
    if (!decision) throw new NotFoundException(`Decision ${decisionId} not found`);

    const review = this.reviews.create({
      decisionId,
      alertId: decision.alertId,
      action,
      comment,
      performedByUserId: actor.id,
      performedByDisplay: actor.displayName ?? actor.email,
    });
    return this.reviews.save(review);
  }

  listForDecision(decisionId: string): Promise<DecisionReview[]> {
    return this.reviews.find({ where: { decisionId }, order: { createdAt: 'DESC' } });
  }

  listForAlert(alertId: string): Promise<DecisionReview[]> {
    return this.reviews.find({ where: { alertId }, order: { createdAt: 'DESC' } });
  }
}
