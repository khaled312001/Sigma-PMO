import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentLayer, GovernanceStatus } from '../../common/enums';
import { AgentExecution, ConfidenceScore } from '../canonical/entities';
import {
  AgentDescriptor,
  AgentProcessResult,
} from '../agents/agent-contract.interface';
import type { AgentRunContext } from '../agents/agent-contract.interface';
import { AgentRegistry } from '../agents/agent.registry';
import { BaseAgentService } from '../agents/base-agent.service';
import { OutboxService } from '../outbox/outbox.service';
import { OpportunityIntelligenceService } from './opportunity-intelligence.service';

/**
 * OpportunityAgentService — the `ext.opportunity` extension agent (Mr. Ayham
 * 2026-06-12 active scope). Runs / re-scores an opportunity screening under the
 * full Agent Contract: the FIRST gate of the investment lifecycle. When given a
 * `screeningId` it re-scores that screening from the current Sigma Assumption
 * Library; with no id it reports the best open opportunity for the project key.
 * Plugs in with zero edits to L0–L8 — like every other extension agent.
 */
@Injectable()
export class OpportunityAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    private readonly intelligence: OpportunityIntelligenceService,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'ext.opportunity',
      layer: AgentLayer.EXT_OPPORTUNITY,
      objective:
        'Opportunity Intelligence — the first gate of the investment lifecycle: ' +
        'screens a project idea against the Sigma Assumption Library (market ' +
        'attractiveness, competition, funding, regulatory complexity) and emits ' +
        'a deterministic 0–100 opportunity score with a proceed / watchlist / ' +
        'reject recommendation, before any feasibility work is spent.',
      inputs: ['opportunity screening inputs', 'Sigma feasibility assumption library', 'location factors'],
      outputs: ['0–100 opportunity score + 4 sub-scores', 'proceed/watchlist/reject recommendation', 'governance status'],
      ruleReferences: ['Sigma feasibility assumption library', 'opportunity scoring formulas'],
    };
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    const screeningId =
      typeof ctx.params?.screeningId === 'string' ? ctx.params.screeningId : undefined;

    // With a screeningId: re-score it. Without: evaluate the best open screening
    // (highest opportunity score) so the agent still produces a node signal.
    const screening = screeningId
      ? await this.intelligence.rescore(screeningId)
      : (await this.intelligence.list())[0] ?? null;

    if (!screening) {
      return {
        outputRefs: { projectKey: projectKey ?? null, screeningId: screeningId ?? null, scored: false },
        confidence: { overall: 0.4, breakdown: { basis: 'no screening to evaluate' } },
        governanceStatus: GovernanceStatus.YELLOW,
        escalationLevel: null,
        outboxEvents: [
          {
            eventType: 'agent.ext.opportunity.scored',
            payload: { projectKey: projectKey ?? null, screeningId: screeningId ?? null, scored: false },
          },
        ],
        summary: screeningId
          ? `Opportunity screening ${screeningId} not found — nothing to re-score.`
          : 'No opportunity screenings recorded yet.',
      };
    }

    const status = this.intelligence.governanceStatus(screening.opportunityScore);
    const scores = screening.scores as {
      marketAttractiveness?: number;
      competitionScore?: number;
      fundingAttractiveness?: number;
      regulatoryComplexity?: number;
    };

    return {
      outputRefs: {
        projectKey: projectKey ?? null,
        screeningId: screening.id,
        code: screening.code,
        opportunityScore: screening.opportunityScore,
        marketAttractiveness: scores.marketAttractiveness ?? null,
        competitionScore: scores.competitionScore ?? null,
        fundingAttractiveness: scores.fundingAttractiveness ?? null,
        regulatoryComplexity: scores.regulatoryComplexity ?? null,
        recommendation: screening.recommendation,
        scored: true,
      },
      confidence: {
        overall: 0.78,
        breakdown: { basis: 'deterministic scoring over Sigma assumption library + location factors' },
      },
      governanceStatus: status,
      escalationLevel:
        status === GovernanceStatus.RED ? 'L3' : status === GovernanceStatus.ORANGE ? 'L2' : null,
      outboxEvents: [
        {
          eventType: 'agent.ext.opportunity.scored',
          payload: {
            projectKey: projectKey ?? null,
            screeningId: screening.id,
            code: screening.code,
            opportunityScore: screening.opportunityScore,
            recommendation: screening.recommendation,
            scored: true,
          },
        },
      ],
      summary: `Opportunity ${screening.code} (${screening.title}): score ${screening.opportunityScore}/100 → ${screening.recommendation.replace(/_/g, ' ')}.`,
    };
  }
}
