import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  AgentExecution,
  Alert,
  ConfidenceScore,
  GovernanceDecision,
} from '../canonical/entities';
import { DecisionCategory, deriveDecisionCategory, isAutoApprovalBlocked } from './decision-category';
import { DecisionChainState, DecisionReviewService } from './decision-review.service';

/**
 * The unified "decision envelope" (Req R7, Mr. Ayham acceptance): for ONE
 * governance decision, the full recommendation in the format Mr. Ayham asked
 * for — confidence, source evidence, reason, alternatives, and the explicit
 * "required human approval" status. The envelope makes clear the platform
 * RECOMMENDS (it never DECIDES): `requiresHumanApproval` is ALWAYS true, and for
 * financial / contractual / safety decisions `autoApprovalBlocked` is true.
 *
 * Everything here is assembled deterministically from repository joins (no LLM):
 *   decision → alert → ConfidenceScore (via ingestionRunId) / AgentExecution
 *   (via journeyCorrelationId) and the append-only DecisionReview chain.
 * Unknown values are `null`, never invented.
 */
export interface DecisionEnvelope {
  decisionId: string;
  alertId: string;
  category: DecisionCategory;
  /** The platform's recommendation — summary + the suggested actions. */
  recommendation: {
    summary: string;
    interventions: string[];
  };
  /** Trust level of the underlying data, with its provenance. */
  confidence: {
    overall: number | null;
    breakdown?: Record<string, unknown> | null;
    source: 'agent-execution' | 'confidence-score' | null;
  };
  /** Where the recommendation came from — the root of the evidence chain. */
  sourceEvidence: {
    alertId: string;
    alertCode: string | null;
    ingestionRunId: string | null;
    sourceFileId: string | null;
    evidenceRefs: string[];
  };
  /** The deterministic reason (the decision's rationale). */
  reason: string;
  /** The alternatives a human can choose between (interventions + options). */
  alternatives: string[];
  responsibleParty: string;
  fidicClause: string | null;
  escalationLevel: string;
  /** ALWAYS true — the platform recommends; a human decides. */
  requiresHumanApproval: true;
  /** True for financial | contractual | safety — the system can never auto-approve. */
  autoApprovalBlocked: boolean;
  /** Live approval state from the append-only DecisionReview audit. */
  approval: {
    status: DecisionChainState;
    approvals: { by: string | null; at: string; action: 'approve' }[];
    awaitingSecondApprover: boolean;
  };
}

/**
 * DecisionEnvelopeService — assembles the {@link DecisionEnvelope} for a single
 * decision id. Reuses the same alert → confidence join the EvidenceService /
 * GovernanceTraceService use, the deterministic category derivation, and the
 * DecisionReviewService approval chain. Read-only.
 */
@Injectable()
export class DecisionEnvelopeService {
  constructor(
    @InjectRepository(GovernanceDecision) private readonly decisions: Repository<GovernanceDecision>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(ConfidenceScore) private readonly confidences: Repository<ConfidenceScore>,
    @InjectRepository(AgentExecution) private readonly executions: Repository<AgentExecution>,
    private readonly reviews: DecisionReviewService,
  ) {}

  async forDecision(decisionId: string): Promise<DecisionEnvelope> {
    const decision = await this.decisions.findOne({ where: { id: decisionId } });
    if (!decision) throw new NotFoundException(`Decision ${decisionId} not found`);

    const alert = await this.alerts.findOne({ where: { id: decision.alertId } });

    // ── Category (persisted; derive on the fly for legacy rows) ─────────────
    const category: DecisionCategory =
      (decision.category as DecisionCategory | null) ??
      deriveDecisionCategory(alert?.code ?? null, decision.fidicClause);

    // ── Confidence: prefer the run's ConfidenceScore (full breakdown), fall
    //    back to the agent execution that threaded this decision's journey. ──
    const confidence = await this.resolveConfidence(alert, decision.journeyCorrelationId);

    // ── Source evidence (root of the chain) ─────────────────────────────────
    const evidenceRefs: string[] = [];
    if (alert?.ingestionRunId) evidenceRefs.push(`ingestionRun:${alert.ingestionRunId}`);
    if (alert?.sourceFileId) evidenceRefs.push(`sourceFile:${alert.sourceFileId}`);
    if (alert?.ruleEvaluationId) evidenceRefs.push(`ruleEvaluation:${alert.ruleEvaluationId}`);

    // ── Approval chain (append-only DecisionReview audit) ──────────────────
    const chain = await this.reviews.chainStateFor(decisionId);
    const approvals = chain.approvals.map((a) => ({
      by: a.performedByDisplay,
      at: a.createdAt,
      action: 'approve' as const,
    }));

    const interventions = decision.interventions ?? [];

    return {
      decisionId: decision.id,
      alertId: decision.alertId,
      category,
      recommendation: {
        summary: alert?.summary ?? decision.rationale,
        interventions,
      },
      confidence,
      sourceEvidence: {
        alertId: decision.alertId,
        alertCode: alert?.code ?? null,
        ingestionRunId: alert?.ingestionRunId ?? null,
        sourceFileId: alert?.sourceFileId ?? null,
        evidenceRefs,
      },
      reason: decision.rationale,
      alternatives: interventions,
      responsibleParty: decision.responsibleParty,
      fidicClause: decision.fidicClause,
      escalationLevel: decision.escalationLevel,
      requiresHumanApproval: true,
      autoApprovalBlocked: isAutoApprovalBlocked(category),
      approval: {
        status: chain.chainState,
        approvals,
        awaitingSecondApprover: chain.chainState === 'awaiting-second-approval',
      },
    };
  }

  /**
   * Resolve the decision's confidence deterministically. Primary source is the
   * run-level ConfidenceScore joined via the alert's ingestionRunId (carries the
   * reproducible `breakdown`). When that is absent we fall back to the
   * AgentExecution that threaded this decision's journey (correlationId), which
   * denormalises `confidenceOverall`. Null when neither exists.
   */
  private async resolveConfidence(
    alert: Alert | null,
    journeyCorrelationId: string | null,
  ): Promise<DecisionEnvelope['confidence']> {
    if (alert?.ingestionRunId) {
      const score = await this.confidences.findOne({ where: { ingestionRunId: alert.ingestionRunId } });
      if (score) {
        return { overall: score.overall, breakdown: score.breakdown ?? null, source: 'confidence-score' };
      }
    }
    if (journeyCorrelationId) {
      const exec = await this.executions.findOne({
        where: { correlationId: journeyCorrelationId },
        order: { createdAt: 'DESC' },
      });
      if (exec && exec.confidenceOverall != null) {
        return { overall: exec.confidenceOverall, breakdown: null, source: 'agent-execution' };
      }
    }
    return { overall: null, breakdown: null, source: null };
  }
}
