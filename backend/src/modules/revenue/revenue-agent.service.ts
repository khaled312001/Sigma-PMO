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
import { RevenueGovernanceService } from './revenue-governance.service';

/**
 * RevenueAgentService — the `ext.revenue_governance` extension agent. Runs the
 * revenue + cash-flow chain validation AND the revenue→NPV/IRR impact analysis
 * under the full Agent Contract. The fourth production extension agent; plugs
 * in with zero edits to L0–L8.
 */
@Injectable()
export class RevenueAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    private readonly revenue: RevenueGovernanceService,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'ext.revenue_governance',
      layer: AgentLayer.EXT_REVENUE_GOVERNANCE,
      objective:
        'Revenue Governance — governs what is earned: the revenue + cash-flow ' +
        'lifecycle chains (Forecast → Business Case → Funding → Actual → ' +
        'Collections → Final), their variances, and the impact on NPV / IRR / ' +
        'Payback. Completes the move from Project to Investment Governance.',
      inputs: ['revenue lifecycle ledger', 'cash-flow ledger', 'feasibility assessments'],
      outputs: ['revenue/cash-flow chain findings', 'NPV/IRR/Payback impact', 'executive recommendations'],
      ruleReferences: ['Sigma traceability chains', 'feasibility financial model'],
    };
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    if (!projectKey) throw new Error('projectKey/nodeBusinessKey is required for ext.revenue_governance');
    const opportunityId = typeof ctx.params?.opportunityId === 'string' ? ctx.params.opportunityId : undefined;

    const validation = await this.revenue.validate(projectKey);
    const impact = await this.revenue.impact(projectKey, opportunityId);

    const critical = validation.findings.filter((f) => f.severity === 'critical').length;
    const warning = validation.findings.filter((f) => f.severity === 'warning').length;
    // Revenue materially below plan is itself an Orange/Red governance signal.
    const revenueShort = impact.revenue.ratio !== null && impact.revenue.ratio < 0.85;
    const status =
      critical > 0 || (impact.revenue.ratio !== null && impact.revenue.ratio < 0.7) ? GovernanceStatus.RED
      : warning > 0 || revenueShort ? GovernanceStatus.ORANGE
      : impact.revenue.ratio !== null && impact.revenue.ratio < 0.95 ? GovernanceStatus.YELLOW
      : GovernanceStatus.GREEN;

    return {
      outputRefs: {
        projectKey, chainFindings: validation.findings.length, subjectsTracked: validation.subjectsChecked,
        revenueRatio: impact.revenue.ratio, deltaNpv: impact.impact?.deltaNpv ?? null, deltaIrrPct: impact.impact?.deltaIrrPct ?? null,
      },
      confidence: { overall: 0.76, breakdown: { basis: 'revenue-traceability + feasibility-model deterministic' } },
      governanceStatus: status,
      escalationLevel: status === GovernanceStatus.RED ? 'L3' : status === GovernanceStatus.ORANGE ? 'L2' : null,
      outboxEvents: [
        { eventType: 'agent.ext.revenue_governance.validated', payload: { projectKey, revenueRatio: impact.revenue.ratio, deltaNpv: impact.impact?.deltaNpv ?? null } },
      ],
      summary: `Revenue governance for ${projectKey}: revenue ${impact.revenue.ratio !== null ? `${(impact.revenue.ratio * 100).toFixed(0)}% of forecast` : 'no actuals'}, ${validation.findings.length} chain finding(s). ${impact.recommendation}`,
    };
  }
}
