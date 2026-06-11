import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentLayer } from '../../common/enums';
import {
  AgentExecution,
  ConfidenceScore,
  ProjectRecord,
} from '../canonical/entities';
import {
  AgentDescriptor,
  AgentProcessResult,
  AgentRunContext,
} from '../agents/agent-contract.interface';
import { AgentRegistry } from '../agents/agent.registry';
import { BaseAgentService } from '../agents/base-agent.service';
import { OutboxService } from '../outbox/outbox.service';

/**
 * EsgAgentService — the REFERENCE future agent (Mr. Ayham's "Sustainability &
 * ESG Agent" example) that proves the extensibility guarantee: it plugs into
 * the platform by extending `BaseAgentService` and self-registering, touching
 * ZERO existing L0–L8 agent code, zero change to the Agent Contract base, the
 * registry or the orchestrator. It appears in `/agents` and is runnable the
 * moment its module is imported.
 *
 * Its logic is a deterministic ESG readiness signal derived from the project
 * records already collected (open NCRs erode Environmental/Quality; change
 * churn erodes Governance) — illustrative, but a real conformant agent with the
 * full seven-field contract + audit + confidence + outbox.
 */
@Injectable()
export class EsgAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    @InjectRepository(ProjectRecord) private readonly records: Repository<ProjectRecord>,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'ext.esg',
      layer: AgentLayer.EXT_ESG,
      objective:
        'Sustainability & ESG assessment — environmental, social and governance ' +
        'readiness scoring from project signals (reference extension agent).',
      inputs: ['project records (NCRs, change requests, …)'],
      outputs: ['ESG scores (environmental/social/governance/overall)'],
      ruleReferences: ['ISO 14001', 'GRI Standards', 'Sigma ESG SOP'],
    };
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    if (!projectKey) throw new Error('projectKey/nodeBusinessKey is required for ext.esg');

    const rows = await this.records.find({
      where: { projectBusinessKey: projectKey, isCurrent: true },
    });
    const ncrOpen = rows.filter((r) => r.recordType === 'ncr' && r.status !== 'closed').length;
    const changeReq = rows.filter((r) => r.recordType === 'change-request').length;

    const environmental = clamp01(1 - ncrOpen * 0.08);
    const social = clamp01(0.9 - ncrOpen * 0.03);
    const governance = clamp01(1 - changeReq * 0.04);
    const overall = Math.round(((environmental + social + governance) / 3) * 1000) / 1000;

    return {
      outputRefs: { environmental, social, governance, overall, ncrOpen, changeRequests: changeReq },
      confidence: { overall: 0.6, breakdown: { rule: 'esg-readiness-v1', basis: 'project-records' } },
      outboxEvents: [
        { eventType: 'agent.ext.esg.completed', payload: { projectKey, overall } },
      ],
      summary: `ESG readiness for ${projectKey}: overall ${overall} (E ${environmental.toFixed(2)} / S ${social.toFixed(2)} / G ${governance.toFixed(2)}).`,
    };
  }
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, Math.round(n * 1000) / 1000));
