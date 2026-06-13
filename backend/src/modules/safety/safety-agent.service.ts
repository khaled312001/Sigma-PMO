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
import { SafetyGovernanceService } from './safety-governance.service';

/**
 * SafetyAgentService — the `ext.safety` extension agent (Safety Governance,
 * Mr. Ayham 2026-06-13 full governance lifecycle). Governs implementation of
 * approved HSE plans during execution: runs the safety-record validation
 * (incidents / corrective actions / inspections / stop-work claim chain) AND
 * the safety-health composite (compliance score + HSE performance index) under
 * the full Agent Contract, mapping them to a 4-tier governance status. Every
 * stop-work links Safety Event → Stop Work → Delay → Critical Path → EOT →
 * Claim readiness. Plugs in with zero edits to L0–L8.
 */
@Injectable()
export class SafetyAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    private readonly safety: SafetyGovernanceService,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'ext.safety',
      layer: AgentLayer.EXT_SAFETY,
      objective:
        'Safety Governance — governs implementation of approved HSE plans during ' +
        'execution: incidents, near-misses, inspections, permits, corrective ' +
        'actions and stop-work events. Every safety finding links to activities ' +
        'and the critical path; stop-work events drive the claim chain Safety ' +
        'Event → Stop Work → Delay → Critical Path → EOT → Claim readiness.',
      inputs: ['safety records (HSE plan, reports, inspections, incidents, near-misses, corrective actions, toolbox talks, audits)', 'stop-work + affected activities', 'EOT days', 'canonical Activity critical-path flags'],
      outputs: ['safety governance findings (risk register)', 'safety compliance score', 'HSE performance index', 'stop-work claim chains', 'safety trend'],
      ruleReferences: ['HSE-plan compliance', 'open-incident / corrective-action penalties', 'inspection overdue window', 'stop-work → EOT claim chain', 'critical-path impact via canonical Activity'],
    };
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    if (!projectKey) throw new Error('projectKey/nodeBusinessKey is required for ext.safety');
    const asOfDate = typeof ctx.params?.asOfDate === 'string' ? ctx.params.asOfDate : '2026-06-12';

    const validation = await this.safety.validate(projectKey, asOfDate);
    const health = await this.safety.safetyHealth(projectKey, asOfDate);

    const critical = validation.findings.filter((f) => f.severity === 'critical').length;
    const warning = validation.findings.filter((f) => f.severity === 'warning').length;
    const claimReady = validation.claimChains.filter((c) => c.claimReady).length;
    // The safety-health composite is the authoritative status; critical
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
        complianceScore: health.complianceScore,
        hsePerformanceIndex: health.hsePerformanceIndex,
        trend: health.trend,
        records: health.records,
        findings: validation.findings.length,
        stopWorkChains: validation.claimChains.length,
        claimReady,
        openIncidents: health.counts.openIncidents,
      },
      confidence: { overall: 0.78, breakdown: { basis: 'safety-record compliance + HSE index + stop-work claim chain over canonical Activity critical path (deterministic)' } },
      governanceStatus: status,
      escalationLevel: status === GovernanceStatus.RED ? 'L3' : status === GovernanceStatus.ORANGE ? 'L2' : null,
      outboxEvents: [
        { eventType: 'agent.ext.safety.done', payload: { projectKey, complianceScore: health.complianceScore, hsePerformanceIndex: health.hsePerformanceIndex, status: health.status, findings: validation.findings.length, stopWorkChains: validation.claimChains.length, claimReady } },
      ],
      summary: `Safety governance for ${projectKey}: compliance ${health.complianceScore}/100, HSE ${health.hsePerformanceIndex}/100 (${health.status}, ${health.trend}), ${health.records} record(s), ${validation.findings.length} finding(s), ${validation.claimChains.length} stop-work chain(s) (${claimReady} claim-ready). ${health.narrative}`,
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
