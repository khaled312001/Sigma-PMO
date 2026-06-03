import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { Alert, DecisionReview, GovernanceDecision, GovernancePolicy, User } from '../canonical/entities';
import { ConfidenceService } from './confidence.service';
import { DecisionReviewService } from './decision-review.service';
import { DecideDto } from './dto/decide.dto';
import { UpsertPolicyDto } from './dto/upsert-policy.dto';
import { EvidencePackage, EvidenceService } from './evidence.service';
import { GovernanceDecisionService } from './governance-decision.service';
import { GovernancePolicyService } from './governance-policy.service';

@Controller('governance')
export class GovernanceController {
  constructor(
    private readonly evidence: EvidenceService,
    private readonly confidence: ConfidenceService,
    private readonly policies: GovernancePolicyService,
    private readonly decisions: GovernanceDecisionService,
    private readonly reviews: DecisionReviewService,
    @InjectRepository(GovernanceDecision) private readonly decisionRepo: Repository<GovernanceDecision>,
    @InjectRepository(GovernancePolicy) private readonly policyRepo: Repository<GovernancePolicy>,
    @InjectRepository(Alert) private readonly alertRepo: Repository<Alert>,
  ) {}

  /** Full evidence chain for an alert (Cycle 3 acceptance surface). */
  @Get('alerts/:id/evidence')
  @RequiresCapability('canRead')
  evidenceForAlert(@Param('id') id: string): Promise<EvidencePackage> {
    return this.evidence.forAlert(id);
  }

  /** Confidence score for one ingestion run. */
  @Get('confidence')
  @RequiresCapability('canRead')
  async confidenceFor(@Query('runId') runId: string) {
    if (!runId) throw new NotFoundException('runId query parameter is required');
    const score = await this.confidence.findByRun(runId);
    if (!score) throw new NotFoundException(`No confidence score for run ${runId}`);
    return score;
  }

  // ---- Layer 2 — Governance policy + decisions --------------------------

  @Get('policy')
  @RequiresCapability('canRead')
  async getPolicy(@Query('projectKey') projectKey?: string) {
    return this.policies.resolveFor(projectKey ?? null);
  }

  @Get('policies')
  @RequiresCapability('canRead')
  listPolicies(@Query('projectKey') projectKey?: string) {
    return this.policies.listVersions(projectKey ?? null);
  }

  @Post('policy')
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  upsertPolicy(@Body() body: UpsertPolicyDto) {
    return this.policies.upsert(body.projectKey ?? null, body.config, body.authoredBy ?? null);
  }

  @Post('decide')
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  decide(@Body() body: DecideDto) {
    return this.decisions.decideForEvaluation(body.ruleEvaluationId, body.projectKey ?? null);
  }

  // ---- Decision review (approve / reject / acknowledge) ---------------

  @Post('decisions/:id/review')
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  async reviewDecision(
    @Param('id') id: string,
    @Body() body: { action: string; comment?: string },
    @Req() req: { user?: User },
  ): Promise<DecisionReview> {
    return this.reviews.record(id, body.action, body.comment ?? null, req.user ?? null);
  }

  @Get('decisions/:id/reviews')
  @RequiresCapability('canRead')
  reviewsForDecision(@Param('id') id: string): Promise<DecisionReview[]> {
    return this.reviews.listForDecision(id);
  }

  /**
   * Batch fetch reviews for many decisions in one round-trip. Avoids the
   * dashboard N+1 (50+ cards × per-decision GET) that otherwise burns the
   * default 100/min throttler bucket.
   *
   * Returns a map keyed by decisionId; each value is the review list in
   * descending createdAt order (same as the single-decision endpoint).
   * Missing ids appear as [] so the client can index without null checks.
   */
  @Get('reviews')
  @RequiresCapability('canRead')
  async reviewsForDecisions(
    @Query('decisionIds') decisionIds?: string,
  ): Promise<Record<string, DecisionReview[]>> {
    const ids = (decisionIds ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return {};
    const cap = Math.min(ids.length, 500);
    return this.reviews.listForDecisionMany(ids.slice(0, cap));
  }

  @Get('alerts/:id/reviews')
  @RequiresCapability('canRead')
  reviewsForAlert(@Param('id') id: string): Promise<DecisionReview[]> {
    return this.reviews.listForAlert(id);
  }

  @Get('decisions')
  @RequiresCapability('canRead')
  async listDecisions(
    @Query('evaluationId') evaluationId?: string,
    @Query('alertId') alertId?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(Math.max(Number.parseInt(limit ?? '100', 10) || 100, 1), 500);
    if (alertId) return this.decisionRepo.find({ where: { alertId }, order: { createdAt: 'DESC' }, take });
    if (evaluationId) {
      // Decisions don't store evaluationId; resolve via the Alert table.
      const alerts = await this.alertRepo.find({ where: { ruleEvaluationId: evaluationId } });
      const ids = alerts.map((a) => a.id);
      return ids.length === 0
        ? []
        : this.decisionRepo.find({ where: { alertId: In(ids) }, order: { createdAt: 'DESC' }, take });
    }
    return this.decisionRepo.find({ order: { createdAt: 'DESC' }, take });
  }
}
