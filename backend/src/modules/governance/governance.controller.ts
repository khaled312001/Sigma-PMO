import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { currentCompanyId } from '../../common/tenant/tenant-context';
import { RequiresCapability } from '../auth/require-capability.decorator';
import { Alert, DecisionReview, GovernanceDecision, GovernancePolicy, User } from '../canonical/entities';
import { SettingsService } from '../settings/settings.service';
import { ConfidenceService } from './confidence.service';
import { deriveDecisionCategory, isAutoApprovalBlocked } from './decision-category';
import { DecisionEnvelope, DecisionEnvelopeService } from './decision-envelope.service';
import { DecisionReviewService, ReviewRecordResult } from './decision-review.service';
import { DECISION_TEMPLATES, DecisionTemplate } from './decision-templates';
import { DecideDto } from './dto/decide.dto';
import { UpsertPolicyDto } from './dto/upsert-policy.dto';
import { EvidencePackage, EvidenceService } from './evidence.service';
import { GovernanceDecisionService } from './governance-decision.service';
import { GovernancePolicyService } from './governance-policy.service';
import { DecisionTrace, GovernanceTraceService } from './governance-trace.service';

/** Default days before a still-pending decision is considered escalated. */
const DEFAULT_ESCALATE_AFTER_DAYS = 7;

@Controller('governance')
export class GovernanceController {
  constructor(
    private readonly evidence: EvidenceService,
    private readonly confidence: ConfidenceService,
    private readonly policies: GovernancePolicyService,
    private readonly decisions: GovernanceDecisionService,
    private readonly reviews: DecisionReviewService,
    private readonly envelope: DecisionEnvelopeService,
    private readonly trace: GovernanceTraceService,
    private readonly settings: SettingsService,
    @InjectRepository(GovernanceDecision) private readonly decisionRepo: Repository<GovernanceDecision>,
    @InjectRepository(GovernancePolicy) private readonly policyRepo: Repository<GovernancePolicy>,
    @InjectRepository(Alert) private readonly alertRepo: Repository<Alert>,
  ) {}

  /** Static decision-template catalog (Layer 3 — keyed by alert-code family). */
  @Get('decision-templates')
  @RequiresCapability('canRead')
  decisionTemplates(): DecisionTemplate[] {
    return DECISION_TEMPLATES;
  }

  /** Full traceability chain for one decision (decision → … → confidence). */
  @Get('decisions/:id/trace')
  @RequiresCapability('canRead')
  traceForDecision(@Param('id') id: string): Promise<DecisionTrace> {
    return this.trace.forDecision(id);
  }

  /**
   * Unified recommendation envelope for one decision (Req R7): confidence +
   * source evidence + reason + alternatives + the explicit "required human
   * approval" status. `requiresHumanApproval` is always true; for financial /
   * contractual / safety decisions `autoApprovalBlocked` is true — the platform
   * recommends, a human decides, and the system never auto-approves these.
   */
  @Get('decisions/:id/envelope')
  @RequiresCapability('canRead')
  envelopeForDecision(@Param('id') id: string): Promise<DecisionEnvelope> {
    return this.envelope.forDecision(id);
  }

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
  ): Promise<ReviewRecordResult> {
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

  /**
   * Platform-wide audit feed — recent decision-review actions joined with
   * the decision they target and the alert that produced it. Powers the
   * /audit page (compliance trail). Sorted by createdAt DESC.
   */
  @Get('audit')
  @RequiresCapability('canRead')
  async audit(@Query('limit') limit?: string): Promise<unknown[]> {
    const take = Math.min(Math.max(Number.parseInt(limit ?? '100', 10) || 100, 1), 500);
    const reviews = await this.reviews.listForDecisionMany([]);
    void reviews; // silence: we use a direct query below
    const rows = this.decisionRepo.manager
      .createQueryBuilder()
      .select('r.id', 'reviewId')
      .addSelect('r.createdAt', 'createdAt')
      .addSelect('r.action', 'action')
      .addSelect('r.comment', 'comment')
      .addSelect('r.performedByUserId', 'actorUserId')
      .addSelect('r.performedByDisplay', 'actorDisplay')
      .addSelect('d.id', 'decisionId')
      .addSelect('d.responsibleParty', 'responsibleParty')
      .addSelect('d.fidicClause', 'fidicClause')
      .addSelect('d.escalationLevel', 'escalationLevel')
      .addSelect('a.id', 'alertId')
      .addSelect('a.code', 'alertCode')
      .addSelect('a.severity', 'severity')
      .addSelect('a.summary', 'alertSummary')
      .from('decision_review', 'r')
      .leftJoin('governance_decision', 'd', 'd.id = r.decisionId')
      .leftJoin('alert', 'a', 'a.id = r.alertId')
      .leftJoin('project', 'p', 'p.id = a.projectId')
      .orderBy('r.createdAt', 'DESC')
      .limit(take);
    // Multi-tenant: only audit rows whose alert's project is in the caller's company.
    const cid = currentCompanyId();
    if (cid) rows.andWhere('p.companyId = :cid', { cid });
    return rows.getRawMany();
  }

  @Get('decisions')
  @RequiresCapability('canRead')
  async listDecisions(
    @Query('evaluationId') evaluationId?: string,
    @Query('alertId') alertId?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(Math.max(Number.parseInt(limit ?? '100', 10) || 100, 1), 500);
    // Multi-tenant: scope decisions to the caller's company via alert → project.
    // (GovernanceDecision has no companyId; the alert's project carries it.)
    const qb = this.decisionRepo
      .createQueryBuilder('d')
      .leftJoin('alert', 'a', 'a.id = d.alertId')
      .leftJoin('project', 'p', 'p.id = a.projectId')
      .orderBy('d.createdAt', 'DESC')
      .take(take);
    if (alertId) qb.andWhere('d.alertId = :alertId', { alertId });
    if (evaluationId) qb.andWhere('a.ruleEvaluationId = :evaluationId', { evaluationId });
    const cid = currentCompanyId();
    if (cid) qb.andWhere('p.companyId = :cid', { cid });
    const rows = await qb.getMany();
    return this.enrichDecisions(rows);
  }

  /**
   * Attach the approval-chain state + escalation flags to each decision row.
   *
   *  - `chainState` / `approvals` / `requiresDualApproval` / `approvalsRemaining`
   *    come from the dual-approval engine (critical decisions need two distinct
   *    approvers).
   *  - `pendingAgeDays` is the age of a still-`pending` decision in whole days.
   *  - `escalated` is true when a pending decision is older than
   *    `governance.escalateAfterDays` (default {@link DEFAULT_ESCALATE_AFTER_DAYS}).
   */
  private async enrichDecisions(rows: GovernanceDecision[]): Promise<unknown[]> {
    if (rows.length === 0) return [];

    // Resolve which decisions require dual approval via the alert join: either
    // critical severity, OR an R7 sensitive category (financial | contractual |
    // safety) that can never be auto-approved on a single signature. The
    // category is persisted on the row; derive it for legacy rows from the
    // alert code + FIDIC clause.
    const alertIds = [...new Set(rows.map((d) => d.alertId))];
    const alerts = await this.alertRepo.find({ where: { id: In(alertIds) } });
    const severityByAlert = new Map(alerts.map((a) => [a.id, a.severity]));
    const codeByAlert = new Map(alerts.map((a) => [a.id, a.code]));
    const categoryByDecision = new Map(
      rows.map((d) => [d.id, d.category ?? deriveDecisionCategory(codeByAlert.get(d.alertId) ?? null, d.fidicClause)]),
    );
    const dualApprovalDecisionIds = new Set(
      rows
        .filter((d) =>
          severityByAlert.get(d.alertId) === 'critical' ||
          isAutoApprovalBlocked(categoryByDecision.get(d.id)),
        )
        .map((d) => d.id),
    );

    const chainStates = await this.reviews.chainStatesFor(
      rows.map((d) => d.id),
      dualApprovalDecisionIds,
    );

    const escalateAfterDays = await this.resolveEscalateAfterDays();
    const now = Date.now();

    return rows.map((d) => {
      const chain = chainStates[d.id];
      const isPending = chain.chainState === 'pending' || chain.chainState === 'awaiting-second-approval';
      const ageDays = Math.floor((now - new Date(d.createdAt).getTime()) / 86_400_000);
      const escalated = isPending && ageDays >= escalateAfterDays;
      const category = categoryByDecision.get(d.id) ?? null;
      return {
        ...d,
        category,
        // R7: the platform recommends, a human decides — always true.
        requiresHumanApproval: true as const,
        autoApprovalBlocked: isAutoApprovalBlocked(category),
        chainState: chain.chainState,
        approvals: chain.approvals,
        requiresDualApproval: chain.requiresDualApproval,
        approvalsRemaining: chain.approvalsRemaining,
        pendingAgeDays: isPending ? ageDays : null,
        escalateAfterDays,
        escalated,
      };
    });
  }

  private async resolveEscalateAfterDays(): Promise<number> {
    const raw = await this.settings.getPlaintext('governance.escalateAfterDays');
    const n = raw === null ? NaN : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_ESCALATE_AFTER_DAYS;
  }
}
