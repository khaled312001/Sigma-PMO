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
  evidenceForAlert(@Param('id') id: string): Promise<EvidencePackage> {
    return this.evidence.forAlert(id);
  }

  /** Confidence score for one ingestion run. */
  @Get('confidence')
  async confidenceFor(@Query('runId') runId: string) {
    if (!runId) throw new NotFoundException('runId query parameter is required');
    const score = await this.confidence.findByRun(runId);
    if (!score) throw new NotFoundException(`No confidence score for run ${runId}`);
    return score;
  }

  // ---- Layer 2 — Governance policy + decisions --------------------------

  @Get('policy')
  async getPolicy(@Query('projectKey') projectKey?: string) {
    return this.policies.resolveFor(projectKey ?? null);
  }

  @Get('policies')
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
  async reviewDecision(
    @Param('id') id: string,
    @Body() body: { action: string; comment?: string },
    @Req() req: { user?: User },
  ): Promise<DecisionReview> {
    return this.reviews.record(id, body.action, body.comment ?? null, req.user ?? null);
  }

  @Get('decisions/:id/reviews')
  reviewsForDecision(@Param('id') id: string): Promise<DecisionReview[]> {
    return this.reviews.listForDecision(id);
  }

  @Get('alerts/:id/reviews')
  reviewsForAlert(@Param('id') id: string): Promise<DecisionReview[]> {
    return this.reviews.listForAlert(id);
  }

  @Get('decisions')
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
