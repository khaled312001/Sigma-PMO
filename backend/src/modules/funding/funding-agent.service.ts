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
import { FundingGovernanceService } from './funding-governance.service';

/**
 * FundingAgentService — the `ext.funding` extension agent (Funding Governance,
 * Mr. Ayham 2026-06-12 active scope). Runs the funding-facility governance
 * validation (DSCR/covenant/drawdown/refinancing) AND the funding-health
 * composite under the full Agent Contract, mapping them to a 4-tier governance
 * status. Connects Revenue Governance to Investment Governance; plugs in with
 * zero edits to L0–L8.
 */
@Injectable()
export class FundingAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    private readonly funding: FundingGovernanceService,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'ext.funding',
      layer: AgentLayer.EXT_FUNDING,
      objective:
        'Funding Governance — governs how the project is financed: loan/equity ' +
        'facilities with drawdown, DSCR + covenant monitoring, debt-service ' +
        'tracking and refinancing-risk signals. Connects Revenue Governance to ' +
        'Investment Governance.',
      inputs: ['funding facilities', 'DSCR + covenant state', 'drawdown / repayment ledger'],
      outputs: ['funding governance findings', 'funding-health composite', 'executive recommendations'],
      ruleReferences: ['DSCR covenant tests', 'drawdown exposure threshold', 'refinancing window', 'feasibility debt-service model'],
    };
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    if (!projectKey) throw new Error('projectKey/nodeBusinessKey is required for ext.funding');
    const asOfDate = typeof ctx.params?.asOfDate === 'string' ? ctx.params.asOfDate : '2026-06-12';

    const validation = await this.funding.validate(projectKey, asOfDate);
    const health = await this.funding.fundingHealth(projectKey, asOfDate);

    const critical = validation.findings.filter((f) => f.severity === 'critical').length;
    const warning = validation.findings.filter((f) => f.severity === 'warning').length;
    // The funding-health composite is the authoritative status; critical
    // findings can only escalate it (never relax it).
    const healthStatus =
      health.status === 'red' ? GovernanceStatus.RED
      : health.status === 'orange' ? GovernanceStatus.ORANGE
      : health.status === 'yellow' ? GovernanceStatus.YELLOW
      : GovernanceStatus.GREEN;
    const status =
      critical > 0 ? worst(healthStatus, GovernanceStatus.ORANGE)
      : warning > 0 ? worst(healthStatus, GovernanceStatus.YELLOW)
      : healthStatus;

    return {
      outputRefs: {
        projectKey,
        fundingHealth: health.score,
        facilities: health.facilities,
        findings: validation.findings.length,
        committed: health.totals.committed,
        drawn: health.totals.drawn,
        outstanding: health.totals.outstanding,
      },
      confidence: { overall: 0.78, breakdown: { basis: 'funding-facility DSCR/covenant/refi + debt-service annuity (deterministic)' } },
      governanceStatus: status,
      escalationLevel: status === GovernanceStatus.RED ? 'L3' : status === GovernanceStatus.ORANGE ? 'L2' : null,
      outboxEvents: [
        { eventType: 'agent.ext.funding.done', payload: { projectKey, fundingHealth: health.score, status: health.status, findings: validation.findings.length } },
      ],
      summary: `Funding governance for ${projectKey}: health ${health.score}/100 (${health.status}), ${health.facilities} facility(ies), ${validation.findings.length} finding(s). ${health.narrative}`,
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
