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
import { RapidAssessmentService } from './rapid-assessment.service';

/**
 * InvestmentAgentService — the Investment & Feasibility Intelligence agent
 * (`ext.investment`), the second real extension agent after ESG: it plugs in
 * through the same registry with zero change to L0–L8, proving the
 * extensibility guarantee again with a *production* capability.
 *
 * Running it (POST /agents/ext.investment/run with params.opportunityId)
 * executes the Level-1 rapid assessment under the full seven-field contract:
 * the run lands in the central AgentExecution audit, carries the
 * deterministic confidence, emits an Outbox event, and contributes the
 * recommendation's 4-tier governance status.
 */
@Injectable()
export class InvestmentAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    private readonly rapid: RapidAssessmentService,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'ext.investment',
      layer: AgentLayer.EXT_INVESTMENT,
      objective:
        'Investment & Feasibility Intelligence — rapid idea-stage investment ' +
        'assessment (Level 1) and the professional feasibility & bankability ' +
        'engine (Level 2): CAPEX/OPEX, revenue, NPV, IRR, payback, DSCR, risk ' +
        'rating and a governance recommendation.',
      inputs: [
        'investment opportunity inputs (type, location, size, funding, objective)',
        'confirmed concept-sketch extractions',
        'Sigma feasibility assumption library',
      ],
      outputs: [
        'feasibility assessment (NPV/IRR/payback/DSCR/risk)',
        'governance recommendation (proceed / conditions / hold / reject)',
        'bankability study sections + audience packages',
      ],
      ruleReferences: ['sigma-feasibility-v1 assumption library', 'bankability floor DSCR ≥ 1.20'],
    };
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const opportunityId = String(ctx.params?.opportunityId ?? '');
    if (!opportunityId) throw new Error('params.opportunityId is required for ext.investment');

    const assessment = await this.rapid.assess(opportunityId, ctx.triggeredBy ?? 'ext.investment');
    const results = assessment.results as Record<string, unknown>;

    return {
      outputRefs: {
        assessmentId: assessment.id,
        opportunityId,
        recommendation: assessment.recommendation,
        riskRating: assessment.riskRating,
        npv: (results.npv as number) ?? null,
        projectIrr: (results.projectIrr as number) ?? null,
        paybackYears: (results.paybackYears as number) ?? null,
        attractivenessScore: (results.attractivenessScore as number) ?? null,
      },
      confidence: {
        overall: assessment.confidence,
        breakdown: { basis: 'input-completeness', libraryVersion: 'sigma-feasibility-v1' },
      },
      governanceStatus: assessment.governanceStatus as GovernanceStatus,
      escalationLevel: assessment.recommendation === 'reject' ? 'L2' : null,
      outboxEvents: [
        {
          eventType: 'agent.ext.investment.assessed',
          payload: {
            opportunityId,
            assessmentId: assessment.id,
            recommendation: assessment.recommendation,
            governanceStatus: assessment.governanceStatus,
          },
        },
      ],
      summary:
        `Opportunity ${opportunityId}: ${assessment.recommendation} ` +
        `(risk ${assessment.riskRating}, confidence ${assessment.confidence}).`,
    };
  }
}
