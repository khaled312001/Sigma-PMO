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
import { FireLifeSafetyGovernanceService } from './fire-life-safety-governance.service';

/**
 * FireLifeSafetyAgentService — the `ext.fire_life_safety` extension agent (Fire
 * & Life Safety Governance, Mr. Ayham 2026-06-13 17-stage lifecycle scope).
 * Runs the fire-safety-record governance validation (rejections / outstanding
 * comments / overdue + at-risk authority approvals) AND the Fire Readiness
 * composite under the full Agent Contract, mapping them to a 4-tier governance
 * status. Governs fire-strategy compliance + Civil Defence approvals; plugs in
 * with zero edits to L0–L8.
 */
@Injectable()
export class FireLifeSafetyAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    private readonly fireSafety: FireLifeSafetyGovernanceService,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'ext.fire_life_safety',
      layer: AgentLayer.EXT_FIRE_LIFE_SAFETY,
      objective:
        'Fire & Life Safety Governance — governs fire-strategy compliance and ' +
        'authority approvals (Civil Defence): fire strategy + drawings, ' +
        'civil-defence reviews, testing & commissioning and inspections, with ' +
        'outstanding-comment tracking, approval-forecast risk and a Fire ' +
        'Readiness composite.',
      inputs: ['fire-safety records', 'authority review status + open comments', 'approval-forecast dates'],
      outputs: ['fire & life safety findings', 'Fire Readiness composite', 'executive recommendations'],
      ruleReferences: ['authority approval status', 'outstanding-comment threshold', 'approval-forecast window', 'rejection compliance test'],
    };
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    if (!projectKey) throw new Error('projectKey/nodeBusinessKey is required for ext.fire_life_safety');
    const asOfDate = typeof ctx.params?.asOfDate === 'string' ? ctx.params.asOfDate : '2026-06-12';

    const validation = await this.fireSafety.validate(projectKey, asOfDate);
    const readiness = await this.fireSafety.fireReadiness(projectKey, asOfDate);

    const critical = validation.findings.filter((f) => f.severity === 'critical').length;
    const warning = validation.findings.filter((f) => f.severity === 'warning').length;
    // The Fire Readiness composite is the authoritative status; critical
    // findings can only escalate it (never relax it).
    const readinessStatus =
      readiness.status === 'red' ? GovernanceStatus.RED
      : readiness.status === 'orange' ? GovernanceStatus.ORANGE
      : readiness.status === 'yellow' ? GovernanceStatus.YELLOW
      : GovernanceStatus.GREEN;
    const status =
      critical > 0 ? worst(readinessStatus, GovernanceStatus.ORANGE)
      : warning > 0 ? worst(readinessStatus, GovernanceStatus.YELLOW)
      : readinessStatus;

    return {
      outputRefs: {
        projectKey,
        fireReadiness: readiness.score,
        records: readiness.records,
        findings: validation.findings.length,
        approved: readiness.totals.approved,
        rejected: readiness.totals.rejected,
        outstandingComments: readiness.totals.outstandingComments,
      },
      confidence: { overall: 0.78, breakdown: { basis: 'fire-safety record approval/comment/forecast governance (deterministic)' } },
      governanceStatus: status,
      escalationLevel: status === GovernanceStatus.RED ? 'L3' : status === GovernanceStatus.ORANGE ? 'L2' : null,
      outboxEvents: [
        { eventType: 'agent.ext.fire_life_safety.done', payload: { projectKey, fireReadiness: readiness.score, status: readiness.status, findings: validation.findings.length } },
      ],
      summary: `Fire & life safety governance for ${projectKey}: readiness ${readiness.score}/100 (${readiness.status}), ${readiness.records} record(s), ${validation.findings.length} finding(s). ${readiness.narrative}`,
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
