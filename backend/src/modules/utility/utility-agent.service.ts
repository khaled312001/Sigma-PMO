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
import { UtilityGovernanceService } from './utility-governance.service';

/**
 * UtilityAgentService — the `ext.utility` extension agent (Utility Governance,
 * Mr. Ayham 2026-06-13 17-stage lifecycle scope). Runs the utility-connection
 * governance validation (required-by breach / delay exposure / stuck-not-started)
 * AND the Utility Readiness Index under the full Agent Contract, mapping them to a
 * 4-tier governance status. Governs utility readiness & connection status plus
 * delay exposure; plugs in with zero edits to L0–L8.
 */
@Injectable()
export class UtilityAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    private readonly utility: UtilityGovernanceService,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'ext.utility',
      layer: AgentLayer.EXT_UTILITY,
      objective:
        'Utility Governance — governs utility readiness & connection status ' +
        '(power, water, telecom, gas, sewerage, district cooling): the Utility ' +
        'Readiness Index, forecast connection dates and the delay exposure of ' +
        'each connection against its required-by date.',
      inputs: ['utility connections', 'connection status', 'application / forecast / required-by dates'],
      outputs: ['utility governance findings', 'Utility Readiness Index', 'forecast connection dates', 'delay exposure'],
      ruleReferences: ['per-status progress weights', 'required-by breach test', 'stuck-not-started window', 'delay exposure formula'],
    };
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    if (!projectKey) throw new Error('projectKey/nodeBusinessKey is required for ext.utility');
    const asOfDate = typeof ctx.params?.asOfDate === 'string' ? ctx.params.asOfDate : '2026-06-12';

    const validation = await this.utility.validate(projectKey, asOfDate);
    const scoreResult = await this.utility.utilityScore(projectKey, asOfDate);

    const critical = validation.findings.filter((f) => f.severity === 'critical').length;
    const warning = validation.findings.filter((f) => f.severity === 'warning').length;
    // The Utility Readiness Index is the authoritative status; critical findings
    // can only escalate it (never relax it).
    const scoreStatus =
      scoreResult.status === 'red' ? GovernanceStatus.RED
      : scoreResult.status === 'orange' ? GovernanceStatus.ORANGE
      : scoreResult.status === 'yellow' ? GovernanceStatus.YELLOW
      : GovernanceStatus.GREEN;
    const status =
      critical > 0 ? worst(scoreStatus, GovernanceStatus.ORANGE)
      : warning > 0 ? worst(scoreStatus, GovernanceStatus.YELLOW)
      : scoreStatus;

    return {
      outputRefs: {
        projectKey,
        utilityReadiness: scoreResult.score,
        connections: scoreResult.connections,
        findings: validation.findings.length,
        connected: scoreResult.totals.connected,
        atRisk: scoreResult.totals.atRisk,
        maxDelayExposureDays: scoreResult.totals.maxDelayExposureDays,
        totalDelayExposureDays: scoreResult.totals.totalDelayExposureDays,
      },
      confidence: { overall: 0.78, breakdown: { basis: 'utility-connection status progress + required-by/forecast delay exposure (deterministic)' } },
      governanceStatus: status,
      escalationLevel: status === GovernanceStatus.RED ? 'L3' : status === GovernanceStatus.ORANGE ? 'L2' : null,
      outboxEvents: [
        { eventType: 'agent.ext.utility.done', payload: { projectKey, utilityReadiness: scoreResult.score, status: scoreResult.status, findings: validation.findings.length } },
      ],
      summary: `Utility governance for ${projectKey}: readiness ${scoreResult.score}/100 (${scoreResult.status}), ${scoreResult.connections} connection(s), ${validation.findings.length} finding(s). ${scoreResult.narrative}`,
    };
  }
}

/** Returns the more severe of two governance statuses (RED > ORANGE > YELLOW > GREEN). */
function worst(a: GovernanceStatus, b: GovernanceStatus): GovernanceStatus {
  const rank: Record<GovernanceStatus, number> = {
    [GovernanceStatus.GREEN]: 0,
    [GovernanceStatus.YELLOW]: 1,
    [GovernanceStatus.ORANGE]: 2,
    [GovernanceStatus.RED]: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}
