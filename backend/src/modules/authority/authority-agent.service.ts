import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentLayer, GovernanceStatus } from '../../common/enums';
import { AgentExecution } from '../canonical/entities/agent-execution.entity';
import { ConfidenceScore } from '../canonical/entities/confidence-score.entity';
import {
  AgentDescriptor,
  AgentProcessResult,
} from '../agents/agent-contract.interface';
import type { AgentRunContext } from '../agents/agent-contract.interface';
import { AgentRegistry } from '../agents/agent.registry';
import { BaseAgentService } from '../agents/base-agent.service';
import { OutboxService } from '../outbox/outbox.service';
import { AuthorityGovernanceService } from './authority-governance.service';

/**
 * AuthorityAgentService — the `ext.authority` extension agent (Authority
 * Governance, Mr. Ayham 2026-06-13 — full 17-stage governance lifecycle). Runs
 * the authority-submission governance validation (delay exposure / critical-path
 * impact / outstanding comments / rejections) AND the authority-readiness score
 * under the full Agent Contract, mapping them to a 4-tier governance status.
 * Authority delays auto-calc project delay exposure and critical-path impact
 * (authority delay → not the contractor's fault). Plugs in with zero edits to
 * L0–L8.
 */
@Injectable()
export class AuthorityAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    private readonly authority: AuthorityGovernanceService,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'ext.authority',
      layer: AgentLayer.EXT_AUTHORITY,
      objective:
        'Authority Governance — governs all authority submissions & approvals ' +
        '(municipality, civil defence, utilities, environmental, RTA, health). ' +
        'Tracks readiness, outstanding comments and forecast approvals, and ' +
        'auto-calculates project delay exposure + critical-path impact when an ' +
        'approval forecast slips past its required-by date (authority delay — ' +
        "not the contractor's fault — feeding extension-of-time claims).",
      inputs: ['authority submissions', 'required-by / forecast approval dates', 'affected schedule activities', 'canonical Activity critical-path'],
      outputs: ['authority governance findings', 'authority-readiness score', 'delay-exposure + critical-path impact', 'executive recommendations'],
      ruleReferences: ['weighted share-approved readiness', 'delay-exposure formula', 'critical-path proxy (schedule-driving finish window)'],
    };
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    if (!projectKey) throw new Error('projectKey/nodeBusinessKey is required for ext.authority');
    const asOfDate = typeof ctx.params?.asOfDate === 'string' ? ctx.params.asOfDate : '2026-06-12';

    const validation = await this.authority.validate(projectKey, asOfDate);
    const score = await this.authority.score(projectKey, asOfDate);

    const critical = validation.findings.filter((f) => f.severity === 'critical').length;
    const warning = validation.findings.filter((f) => f.severity === 'warning').length;
    // The authority-readiness score is the authoritative status; critical
    // findings can only escalate it (never relax it).
    const scoreStatus =
      score.status === 'red' ? GovernanceStatus.RED
      : score.status === 'orange' ? GovernanceStatus.ORANGE
      : score.status === 'yellow' ? GovernanceStatus.YELLOW
      : GovernanceStatus.GREEN;
    const status =
      critical > 0 ? worst(scoreStatus, GovernanceStatus.ORANGE)
      : warning > 0 ? worst(scoreStatus, GovernanceStatus.YELLOW)
      : scoreStatus;

    return {
      outputRefs: {
        projectKey,
        authorityReadiness: score.score,
        submissions: score.submissions,
        findings: validation.findings.length,
        approved: score.totals.approved,
        pending: score.totals.pending,
        totalDelayExposureDays: score.totals.totalDelayExposureDays,
        criticalPathImpacts: score.totals.criticalPathImpacts,
      },
      confidence: { overall: 0.78, breakdown: { basis: 'authority-submission weighted share-approved + delay-exposure vs required-by + critical-path proxy (deterministic)' } },
      governanceStatus: status,
      escalationLevel: status === GovernanceStatus.RED ? 'L3' : status === GovernanceStatus.ORANGE ? 'L2' : null,
      outboxEvents: [
        { eventType: 'agent.ext.authority.done', payload: { projectKey, authorityReadiness: score.score, status: score.status, findings: validation.findings.length, totalDelayExposureDays: score.totals.totalDelayExposureDays, criticalPathImpacts: score.totals.criticalPathImpacts } },
      ],
      summary: `Authority governance for ${projectKey}: readiness ${score.score}/100 (${score.status}), ${score.submissions} submission(s), ${validation.findings.length} finding(s). ${score.narrative}`,
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
