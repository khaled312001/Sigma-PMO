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
import { ProcurementValidationService } from './procurement-validation.service';

/**
 * ProcurementAgentService — the `ext.procurement` extension agent. Runs the
 * Procurement Governance Validation (BIM vs procured vs installed; planned vs
 * actual delivery; long-lead exposure; vendor risk) under the full Agent
 * Contract — every run is an audited AgentExecution with confidence,
 * governance status and an Outbox event. Plugs in with zero edits to L0–L8.
 */
@Injectable()
export class ProcurementAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    private readonly validation: ProcurementValidationService,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'ext.procurement',
      layer: AgentLayer.EXT_PROCUREMENT,
      objective:
        'Procurement Intelligence — procurement governance and supply-chain ' +
        'intelligence: planning & long-lead tracking, vendor intelligence, ' +
        'RFQ/bid governance, delivery tracking, and cross-source validation ' +
        '(BIM vs procured vs installed; planned vs actual delivery).',
      inputs: ['procurement packages', 'vendor registry', 'BIM quantities', 'delivery records'],
      outputs: ['award recommendations', 'delivery tracking', 'procurement governance findings'],
      ruleReferences: ['Sigma procurement-governance-v1'],
    };
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    if (!projectKey) throw new Error('projectKey/nodeBusinessKey is required for ext.procurement');
    const asOfDate = typeof ctx.params?.asOfDate === 'string' ? ctx.params.asOfDate : undefined;

    const result = await this.validation.validate(projectKey, asOfDate);
    const critical = result.findings.filter((f) => f.severity === 'critical').length;
    const warning = result.findings.filter((f) => f.severity === 'warning').length;
    const status =
      critical > 0 ? GovernanceStatus.ORANGE : warning > 0 ? GovernanceStatus.YELLOW : GovernanceStatus.GREEN;

    return {
      outputRefs: { projectKey, findingCount: result.findings.length, byType: result.counts, critical, warning },
      confidence: { overall: 0.78, breakdown: { basis: 'cross-source-deterministic', engine: 'procurement-governance-v1' } },
      governanceStatus: status,
      escalationLevel: critical > 0 ? 'L2' : null,
      outboxEvents: [
        { eventType: 'agent.ext.procurement.validated', payload: { projectKey, findingCount: result.findings.length, critical } },
      ],
      summary: `Procurement governance for ${projectKey}: ${result.findings.length} finding(s) (${critical} critical, ${warning} warning).`,
    };
  }
}
