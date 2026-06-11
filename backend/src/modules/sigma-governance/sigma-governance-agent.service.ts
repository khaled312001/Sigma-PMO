import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentLayer, HierarchyLevel } from '../../common/enums';
import {
  AgentExecution,
  Claim,
  ConfidenceScore,
  CorrectiveAction,
  Project,
  Risk,
} from '../canonical/entities';
import {
  AgentDescriptor,
  AgentProcessResult,
  AgentRunContext,
} from '../agents/agent-contract.interface';
import { AgentRegistry } from '../agents/agent.registry';
import { BaseAgentService } from '../agents/base-agent.service';
import { GovernanceStatusService } from '../hierarchy/governance-status.service';
import { OutboxService } from '../outbox/outbox.service';
import { ConsolidatedNode, ConsolidationService } from './consolidation.service';

/**
 * L8 Sigma Governance AI (Mr. Ayham's final authority, Layer 8) — consolidates
 * the outputs of all prior agents into ONE authoritative governance verdict per
 * node, generates corrective-action recommendations, manages escalation, and
 * owns the evidence trail + decision log. This is the "Governance Decision
 * Support System, not a reporting tool" requirement made concrete: it does not
 * just report status, it recomputes the 4-tier status, then issues the actions.
 *
 * Pull-based + idempotent: it reads the latest agent outputs (not relying on
 * Outbox arrival order) and upserts corrective actions by a dedup key.
 */
@Injectable()
export class SigmaGovernanceAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Risk) private readonly risks: Repository<Risk>,
    @InjectRepository(Claim) private readonly claims: Repository<Claim>,
    @InjectRepository(CorrectiveAction) private readonly actions: Repository<CorrectiveAction>,
    private readonly status: GovernanceStatusService,
    private readonly consolidation: ConsolidationService,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'l8.sigma_governance',
      layer: AgentLayer.L8_SIGMA_GOVERNANCE,
      objective:
        'Consolidate all agent outputs into one authoritative governance verdict; ' +
        'generate corrective actions, manage escalation, maintain the evidence trail ' +
        'and decision log, and own portfolio governance oversight.',
      inputs: ['every agent execution for the node', 'risk + claim registers', 'governance status'],
      outputs: ['authoritative 4-tier status', 'corrective-action recommendations', 'escalation decisions'],
      ruleReferences: ['Sigma governance framework', 'PMI governance'],
    };
  }

  /** Read-only consolidated view (the command-center node detail). */
  consolidate(nodeType: string, nodeBusinessKey: string): Promise<ConsolidatedNode> {
    return this.consolidation.consolidate(nodeType, nodeBusinessKey);
  }

  listCorrectiveActions(nodeBusinessKey: string) {
    return this.consolidation.listCorrectiveActions(nodeBusinessKey);
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    if (!projectKey) throw new Error('projectKey/nodeBusinessKey is required for l8.sigma_governance');
    const nodeType = (ctx.nodeType as string) ?? HierarchyLevel.PROJECT;

    if (nodeType === HierarchyLevel.PROJECT) {
      const project = await this.projects.findOne({ where: { businessKey: projectKey, isCurrent: true } });
      if (!project) throw new NotFoundException(`No current project "${projectKey}"`);
    }

    // 1) Recompute the authoritative 4-tier status (worst-of for roll-ups).
    const statusResult = await this.recomputeStatus(nodeType, projectKey);

    // 2) Generate corrective actions from the open registers (project level).
    let generated = 0;
    if (nodeType === HierarchyLevel.PROJECT) {
      generated = await this.generateCorrectiveActions(nodeType, projectKey);
    }

    // 3) Consolidated view for the audit output.
    const consolidated = await this.consolidation.consolidate(nodeType, projectKey);

    const escalationLevel = statusResult.status === 'red' ? 'L3' : statusResult.status === 'orange' ? 'L2' : null;

    return {
      outputRefs: {
        governanceStatus: statusResult.status,
        score: statusResult.score,
        correctiveActionsGenerated: generated,
        openCorrectiveActions: consolidated.openCorrectiveActions,
        agentsConsolidated: consolidated.agents.length,
      },
      confidence: { overall: 0.9, breakdown: { rule: 'l8-consolidation-v1' } },
      escalationLevel,
      governanceStatus: statusResult.status,
      outboxEvents: [
        {
          eventType: 'governance.sigma.consolidated',
          payload: { nodeType, nodeBusinessKey: projectKey, status: statusResult.status, correctiveActions: generated },
        },
      ],
      summary: `Sigma Governance consolidated ${projectKey}: status ${statusResult.status}, ${consolidated.agents.length} agent(s), ${generated} corrective action(s).`,
    };
  }

  private recomputeStatus(nodeType: string, key: string) {
    switch (nodeType) {
      case HierarchyLevel.ENTERPRISE: return this.status.recomputeEnterprise(key);
      case HierarchyLevel.PORTFOLIO: return this.status.recomputePortfolio(key);
      case HierarchyLevel.PROGRAM: return this.status.recomputeProgram(key);
      default: return this.status.recomputeProject(key);
    }
  }

  /** Issue corrective actions from open high/critical risks + potential claims. */
  private async generateCorrectiveActions(nodeType: string, projectKey: string): Promise<number> {
    let count = 0;
    const upsert = async (a: {
      title: string; description: string; sourceLayer: string;
      priority: string; escalationLevel: string | null; dedupKey: string;
    }) => {
      const existing = await this.actions.findOne({ where: { nodeBusinessKey: projectKey, dedupKey: a.dedupKey } });
      const row = existing ?? this.actions.create({ nodeType, nodeBusinessKey: projectKey, status: 'open', owner: null });
      // Don't resurrect a manually-closed action; only refresh open ones.
      if (existing && existing.status !== 'open') return;
      Object.assign(row, a, { nodeType, nodeBusinessKey: projectKey });
      await this.actions.save(row);
      count += 1;
    };

    const highRisks = await this.risks.find({
      where: { projectBusinessKey: projectKey, status: 'open' },
      order: { priorityScore: 'DESC' },
    });
    for (const r of highRisks.filter((x) => x.tier === 'high' || x.tier === 'critical')) {
      await upsert({
        title: `Mitigate: ${r.title}`,
        description: r.mitigation,
        sourceLayer: AgentLayer.L5_RISK,
        priority: r.tier,
        escalationLevel: r.tier === 'critical' ? 'L3' : 'L2',
        dedupKey: `risk:${r.id}`,
      });
    }

    const claims = await this.claims.find({ where: { projectBusinessKey: projectKey, status: 'potential' } });
    for (const c of claims) {
      await upsert({
        title: `Prepare ${c.type.toUpperCase()} claim: ${c.title}`,
        description: `${c.basis} (responsibility: ${c.responsibleParty}${c.fidicClause ? `, ${c.fidicClause}` : ''}).`,
        sourceLayer: AgentLayer.L6_CLAIMS,
        priority: c.type === 'eot' ? 'high' : 'medium',
        escalationLevel: 'L2',
        dedupKey: `claim:${c.id}`,
      });
    }

    return count;
  }
}
