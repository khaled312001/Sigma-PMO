import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { AgentExecution, Alert, ConfidenceScore, GovernanceDecision } from '../canonical/entities';
import { DecisionEnvelopeService } from './decision-envelope.service';
import { DecisionReviewService } from './decision-review.service';

/**
 * Decision envelope (Req R7): the unified recommendation — confidence + source
 * evidence + reason + alternatives + the always-true "requires human approval"
 * status, with `autoApprovalBlocked` true for financial / contractual / safety.
 */

function repoOne<T extends object>(one: T | null): Repository<T> {
  return { findOne: jest.fn().mockResolvedValue(one) } as unknown as Repository<T>;
}

const FINANCIAL_DECISION: GovernanceDecision = {
  id: 'dec-1',
  alertId: 'alert-1',
  responsibleParty: 'shared',
  fidicClause: 'Sub-Clause 13 / 14',
  fidicNotice: 'Variations and adjustments…',
  fidicDeadlineDays: null,
  escalationLevel: 'L3',
  notifyParties: ['client', 'sigma'],
  interventions: ['Variation order under Sub-Clause 13', 'Cost validation against measured progress'],
  rationale: 'Rule COST_OVERRUN of severity critical; party: shared.',
  category: 'financial',
  journeyCorrelationId: null,
} as GovernanceDecision;

const ALERT: Alert = {
  id: 'alert-1',
  code: 'COST_OVERRUN',
  severity: 'critical',
  summary: 'Actual cost exceeds budget by 18%.',
  ingestionRunId: 'run-1',
  sourceFileId: 'src-1',
  ruleEvaluationId: 'eval-1',
} as Alert;

const CONFIDENCE: ConfidenceScore = {
  id: 'cs-1',
  ingestionRunId: 'run-1',
  overall: 0.83,
  completeness: 0.9,
  consistency: 0.8,
  sourceReliability: 0.7,
  breakdown: { weights: { completeness: 0.4 } },
} as ConfidenceScore;

/** Review service stub whose chainStateFor returns a single-approval awaiting state. */
function makeReviewService(over: Partial<Awaited<ReturnType<DecisionReviewService['chainStateFor']>>> = {}): DecisionReviewService {
  return {
    chainStateFor: jest.fn().mockResolvedValue({
      chainState: 'awaiting-second-approval',
      approvals: [{ performedByDisplay: 'Alice', createdAt: '2026-06-29T10:00:00.000Z' }],
      requiresDualApproval: true,
      approvalsRemaining: 1,
      autoApprovalBlocked: true,
      category: 'financial',
      ...over,
    }),
  } as unknown as DecisionReviewService;
}

describe('DecisionEnvelopeService', () => {
  it('throws NotFound for an unknown decision', async () => {
    const svc = new DecisionEnvelopeService(
      repoOne<GovernanceDecision>(null),
      repoOne<Alert>(null),
      repoOne<ConfidenceScore>(null),
      repoOne<AgentExecution>(null),
      makeReviewService(),
    );
    await expect(svc.forDecision('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assembles confidence + evidence + alternatives + requiresHumanApproval + autoApprovalBlocked for a financial decision', async () => {
    const svc = new DecisionEnvelopeService(
      repoOne<GovernanceDecision>(FINANCIAL_DECISION),
      repoOne<Alert>(ALERT),
      repoOne<ConfidenceScore>(CONFIDENCE),
      repoOne<AgentExecution>(null),
      makeReviewService(),
    );
    const env = await svc.forDecision('dec-1');

    expect(env.category).toBe('financial');
    expect(env.requiresHumanApproval).toBe(true);
    expect(env.autoApprovalBlocked).toBe(true);

    // Confidence joined via the alert's ingestionRunId (run-level score wins).
    expect(env.confidence).toEqual({
      overall: 0.83,
      breakdown: { weights: { completeness: 0.4 } },
      source: 'confidence-score',
    });

    // Source evidence carries the alert code + provenance refs.
    expect(env.sourceEvidence.alertCode).toBe('COST_OVERRUN');
    expect(env.sourceEvidence.ingestionRunId).toBe('run-1');
    expect(env.sourceEvidence.sourceFileId).toBe('src-1');
    expect(env.sourceEvidence.evidenceRefs).toEqual(
      expect.arrayContaining(['ingestionRun:run-1', 'sourceFile:src-1', 'ruleEvaluation:eval-1']),
    );

    // Alternatives == interventions; reason == rationale.
    expect(env.alternatives).toEqual(FINANCIAL_DECISION.interventions);
    expect(env.recommendation.interventions).toEqual(FINANCIAL_DECISION.interventions);
    expect(env.reason).toBe(FINANCIAL_DECISION.rationale);

    // Approval chain surfaced from DecisionReview.
    expect(env.approval.status).toBe('awaiting-second-approval');
    expect(env.approval.awaitingSecondApprover).toBe(true);
    expect(env.approval.approvals).toEqual([{ by: 'Alice', at: '2026-06-29T10:00:00.000Z', action: 'approve' }]);
  });

  it('falls back to the agent-execution confidence when no ConfidenceScore exists', async () => {
    const decision = { ...FINANCIAL_DECISION, journeyCorrelationId: 'corr-1' } as GovernanceDecision;
    const exec = { id: 'ae-1', correlationId: 'corr-1', confidenceOverall: 0.71 } as AgentExecution;
    const svc = new DecisionEnvelopeService(
      repoOne<GovernanceDecision>(decision),
      repoOne<Alert>(ALERT),
      repoOne<ConfidenceScore>(null), // no run-level score
      repoOne<AgentExecution>(exec),
      makeReviewService(),
    );
    const env = await svc.forDecision('dec-1');
    expect(env.confidence).toEqual({ overall: 0.71, breakdown: null, source: 'agent-execution' });
  });

  it('derives the category for a legacy row with a null category column', async () => {
    const legacy = { ...FINANCIAL_DECISION, category: null } as GovernanceDecision;
    const svc = new DecisionEnvelopeService(
      repoOne<GovernanceDecision>(legacy),
      repoOne<Alert>(ALERT),
      repoOne<ConfidenceScore>(CONFIDENCE),
      repoOne<AgentExecution>(null),
      makeReviewService(),
    );
    const env = await svc.forDecision('dec-1');
    // COST_OVERRUN derives to financial → still auto-approval-blocked.
    expect(env.category).toBe('financial');
    expect(env.autoApprovalBlocked).toBe(true);
  });
});
