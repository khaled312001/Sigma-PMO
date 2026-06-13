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
import { OperationalReadinessGovernanceService } from './operational-readiness-governance.service';

/**
 * OperationalReadinessAgentService — the `ext.operational_readiness` extension
 * agent (Operational Readiness Governance, Mr. Ayham 2026-06-13). Runs the
 * readiness-item governance validation (overdue/incomplete/go-live blockers)
 * AND the readiness-score composite (with go-live / handover / commissioning
 * sub-scores) under the full Agent Contract, mapping them to a 4-tier
 * governance status. Governs the construction-complete → operational go-live
 * transition; plugs in with zero edits to L0–L8.
 */
@Injectable()
export class OperationalReadinessAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    private readonly readiness: OperationalReadinessGovernanceService,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'ext.operational_readiness',
      layer: AgentLayer.EXT_OPERATIONAL_READINESS,
      objective:
        'Operational Readiness Governance — governs the construction-complete → ' +
        'operational go-live transition: O&M manuals, asset registers, training, ' +
        'testing & commissioning, handover, staffing, spares and warranties. ' +
        'Derives a readiness score plus go-live / handover / commissioning ' +
        'sub-scores and flags overdue / go-live-blocking items.',
      inputs: ['operational readiness items', 'category + status + completion state', 'due-date schedule'],
      outputs: ['readiness governance findings', 'readiness score + sub-scores', 'executive recommendations'],
      ruleReferences: ['per-status progress weights', 'category → sub-score grouping', 'go-live window', 'overdue-vs-dueDate test'],
    };
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    if (!projectKey) throw new Error('projectKey/nodeBusinessKey is required for ext.operational_readiness');
    const asOfDate = typeof ctx.params?.asOfDate === 'string' ? ctx.params.asOfDate : '2026-06-12';

    const validation = await this.readiness.validate(projectKey, asOfDate);
    const score = await this.readiness.readinessScore(projectKey, asOfDate);

    const critical = validation.findings.filter((f) => f.severity === 'critical').length;
    const warning = validation.findings.filter((f) => f.severity === 'warning').length;
    // The readiness-score composite is the authoritative status; critical
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
        readinessScore: score.score,
        items: score.items,
        findings: validation.findings.length,
        goLiveReadiness: score.subScores.goLiveReadiness,
        handoverReadiness: score.subScores.handoverReadiness,
        commissioningReadiness: score.subScores.commissioningReadiness,
        overdue: score.totals.overdue,
      },
      confidence: { overall: 0.78, breakdown: { basis: 'readiness-item per-status progress + category sub-scores + overdue/go-live tests (deterministic)' } },
      governanceStatus: status,
      escalationLevel: status === GovernanceStatus.RED ? 'L3' : status === GovernanceStatus.ORANGE ? 'L2' : null,
      outboxEvents: [
        { eventType: 'agent.ext.operational_readiness.done', payload: { projectKey, readinessScore: score.score, status: score.status, findings: validation.findings.length } },
      ],
      summary: `Operational readiness governance for ${projectKey}: score ${score.score}/100 (${score.status}), ${score.items} item(s), ${validation.findings.length} finding(s). ${score.narrative}`,
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
