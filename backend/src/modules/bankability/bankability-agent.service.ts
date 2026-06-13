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
import { BankabilityService } from './bankability.service';

/**
 * BankabilityAgentService — the `ext.bankability` extension agent (Bankability
 * Intelligence, Mr. Ayham 2026-06-13 full governance lifecycle). Transforms the
 * feasibility outputs into a lender-ready position: it runs the deterministic
 * bankability assessment (DSCR vs covenant, debt schedule, funding requirements,
 * investor/lender package readiness) AND the bankability findings under the full
 * Agent Contract, mapping them to a 4-tier governance status. Reads existing
 * FeasibilityAssessment + FundingFacility data — owns no entity, plugs in with
 * zero edits to L0–L8.
 */
@Injectable()
export class BankabilityAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    private readonly bankability: BankabilityService,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'ext.bankability',
      layer: AgentLayer.EXT_BANKABILITY,
      objective:
        'Bankability Intelligence — transforms feasibility outputs into a ' +
        'lender-ready package: DSCR vs covenant, annuity-based debt schedule, ' +
        'funding requirements (CAPEX vs committed facilities), a bankability ' +
        'verdict and investor + lender package readiness. Completes the ' +
        'feasibility → financeable-deal chain.',
      inputs: ['latest feasibility assessment (NPV/IRR/DSCR/CAPEX)', 'funding facilities + covenants', 'committed vs required funding'],
      outputs: ['bankability assessment + verdict', 'DSCR + debt schedule', 'investor + lender package readiness', 'bankability findings'],
      ruleReferences: ['DSCR bankability floor (1.20)', 'sources & uses funding-gap test', 'prudent leverage ceiling (70%)', 'feasibility annuity debt-service model'],
    };
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    if (!projectKey) throw new Error('projectKey/nodeBusinessKey is required for ext.bankability');
    const asOfDate = typeof ctx.params?.asOfDate === 'string' ? ctx.params.asOfDate : '2026-06-12';

    const assessment = await this.bankability.assess(projectKey, asOfDate);
    const validation = await this.bankability.validate(projectKey, asOfDate);

    const critical = validation.findings.filter((f) => f.severity === 'critical').length;
    const warning = validation.findings.filter((f) => f.severity === 'warning').length;
    // The bankability composite is the authoritative status; critical findings
    // can only escalate it (never relax it).
    const baseStatus =
      assessment.status === 'red' ? GovernanceStatus.RED
      : assessment.status === 'orange' ? GovernanceStatus.ORANGE
      : assessment.status === 'yellow' ? GovernanceStatus.YELLOW
      : GovernanceStatus.GREEN;
    const status =
      critical > 0 ? worst(baseStatus, GovernanceStatus.ORANGE)
      : warning > 0 ? worst(baseStatus, GovernanceStatus.YELLOW)
      : baseStatus;

    return {
      outputRefs: {
        projectKey,
        bankabilityScore: assessment.score,
        verdict: assessment.verdict,
        facilities: assessment.facilities,
        findings: validation.findings.length,
        effectiveDscr: assessment.dscr.effectiveDscr,
        capex: assessment.fundingRequirements.capex,
        fundingGap: assessment.fundingRequirements.fundingGap,
        debtScheduleYears: assessment.debtSchedule.length,
      },
      confidence: { overall: 0.78, breakdown: { basis: 'feasibility DSCR/CAPEX + funding facilities + annuity debt schedule (deterministic)' } },
      governanceStatus: status,
      escalationLevel: status === GovernanceStatus.RED ? 'L3' : status === GovernanceStatus.ORANGE ? 'L2' : null,
      outboxEvents: [
        { eventType: 'agent.ext.bankability.done', payload: { projectKey, bankabilityScore: assessment.score, verdict: assessment.verdict, status: assessment.status, findings: validation.findings.length } },
      ],
      summary: `Bankability for ${projectKey}: ${assessment.score}/100 (${assessment.verdict}), ${assessment.facilities} facility(ies), ${validation.findings.length} finding(s). ${assessment.narrative}`,
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
