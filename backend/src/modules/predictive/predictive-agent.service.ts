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
import { PREDICTIVE_AS_OF, PredictionService } from './prediction.service';

/**
 * PredictiveAgentService — the `ext.predictive` extension agent (Mr. Ayham's
 * Predictive Governance, 2026-06-12 active scope). Runs the five deterministic
 * forecasts (cost overrun, schedule delay, revenue gap, procurement risk,
 * funding risk) under the full Agent Contract and contributes a worst-of
 * governance status. Plugs into L0–L8 via the registry with zero core changes.
 */
@Injectable()
export class PredictiveAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    private readonly prediction: PredictionService,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'ext.predictive',
      layer: AgentLayer.EXT_PREDICTIVE,
      objective:
        'Predictive Governance — forward-looking, deterministic forecasts of ' +
        'cost overrun (CPI/EAC), schedule delay (SPI), revenue gap, procurement ' +
        'risk and funding risk, consolidated into a predictive governance status. ' +
        'Turns the current world state into an early-warning signal.',
      inputs: ['canonical activities (EVM)', 'revenue lifecycle ledger', 'procurement findings', 'funding facilities'],
      outputs: ['five risk/variance forecasts', 'recommended actions', 'predictive governance status'],
      ruleReferences: ['PMI Earned Value Management', 'AACE 17R-97 (EAC)', 'DSCR covenant analysis'],
    };
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    if (!projectKey) throw new Error('projectKey/nodeBusinessKey is required for ext.predictive');
    const asOfDate = typeof ctx.params?.asOfDate === 'string' ? ctx.params.asOfDate : PREDICTIVE_AS_OF;

    const result = await this.prediction.forecast(projectKey, asOfDate);

    const status = result.predictiveGovernanceStatus;
    // Confidence reflects how many of the five forecasts actually had data.
    const withData = result.forecasts.filter((f) => f.value !== null).length;
    const confidence = Math.max(0.4, Math.min(0.95, 0.4 + (withData / 5) * 0.55));

    const summaryByMetric = result.forecasts.reduce<Record<string, unknown>>((acc, f) => {
      acc[f.metric] = f.value;
      return acc;
    }, {});

    return {
      outputRefs: {
        projectKey,
        asOfDate,
        ...summaryByMetric,
        predictiveGovernanceStatus: status,
        forecastsWithData: withData,
      },
      confidence: {
        overall: Math.round(confidence * 1000) / 1000,
        breakdown: { forecastsWithData: withData, basis: 'deterministic-evm + ledger + findings + facilities' },
      },
      governanceStatus: status,
      escalationLevel:
        status === GovernanceStatus.RED ? 'L3'
        : status === GovernanceStatus.ORANGE ? 'L2'
        : status === GovernanceStatus.YELLOW ? 'L1'
        : null,
      outboxEvents: [
        {
          eventType: 'agent.ext.predictive.done',
          payload: {
            projectKey,
            asOfDate,
            predictiveGovernanceStatus: status,
            ...summaryByMetric,
          },
        },
      ],
      summary: result.headline,
    };
  }
}
