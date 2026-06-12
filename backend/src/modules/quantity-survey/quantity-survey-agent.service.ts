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
import { QsGovernanceService } from './qs-governance.service';

/**
 * QuantitySurveyAgentService — the `ext.quantity_survey` extension agent. Runs
 * the QS Governance Layer (cross-source quantity/cost validation) under the
 * full Agent Contract: every run is an audited AgentExecution carrying the
 * confidence, governance status and an Outbox event. Plugs in with zero edits
 * to L0–L8 — the third production proof of the extensibility guarantee.
 */
@Injectable()
export class QuantitySurveyAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    private readonly governance: QsGovernanceService,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'ext.quantity_survey',
      layer: AgentLayer.EXT_QUANTITY_SURVEY,
      objective:
        'Quantity Survey Intelligence — concept-to-final-account cost & quantity ' +
        'governance: classified cost estimates (NRM/UniFormat/MasterFormat/CESMM), ' +
        'BOQ intelligence, measurement, and cross-source quantity/cost validation ' +
        '(BOQ vs BIM, over-measurement, duplicate quantities, quantity-to-cost).',
      inputs: ['BIM models', 'BOQ documents', 'cost estimates', 'progress measurement'],
      outputs: ['classified cost plans', 'BOQs', 'QS governance findings'],
      ruleReferences: ['sigma-cost-classification-v1', 'NRM', 'UniFormat', 'MasterFormat', 'CESMM'],
    };
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    if (!projectKey) throw new Error('projectKey/nodeBusinessKey is required for ext.quantity_survey');

    const result = await this.governance.validate(projectKey);
    const critical = result.findings.filter((f) => f.severity === 'critical').length;
    const warning = result.findings.filter((f) => f.severity === 'warning').length;
    const status =
      critical > 0 ? GovernanceStatus.ORANGE : warning > 0 ? GovernanceStatus.YELLOW : GovernanceStatus.GREEN;

    return {
      outputRefs: { projectKey, findingCount: result.findings.length, byType: result.counts, critical, warning },
      confidence: { overall: 0.8, breakdown: { basis: 'cross-source-deterministic', classification: 'sigma-cost-classification-v1' } },
      governanceStatus: status,
      escalationLevel: critical > 0 ? 'L2' : null,
      outboxEvents: [
        { eventType: 'agent.ext.quantity_survey.validated', payload: { projectKey, findingCount: result.findings.length, critical } },
      ],
      summary: `QS governance for ${projectKey}: ${result.findings.length} finding(s) (${critical} critical, ${warning} warning).`,
    };
  }
}
