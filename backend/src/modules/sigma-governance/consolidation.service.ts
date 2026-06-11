import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { HierarchyLevel } from '../../common/enums';
import {
  AgentExecution,
  Claim,
  CorrectiveAction,
  GovernanceStatusSnapshot,
  Risk,
} from '../canonical/entities';

/** The latest run of one agent against a node. */
export interface AgentRollup {
  agentKey: string;
  layer: string;
  status: string;
  governanceStatus: string | null;
  escalationLevel: string | null;
  confidence: number | null;
  lastRunAt: string | null;
  summary: string | null;
}

/** The consolidated governance picture for one node (L8 output). */
export interface ConsolidatedNode {
  nodeType: string;
  nodeBusinessKey: string;
  governanceStatus: string | null;
  score: number | null;
  agents: AgentRollup[];
  openCorrectiveActions: number;
  openRisks: number;
  criticalRisks: number;
  potentialClaims: number;
  topRisks: Array<{ title: string; tier: string; priorityScore: number }>;
}

/**
 * ConsolidationService — the read side of L8 Sigma Governance AI. Pull-based by
 * design (the Outbox is Stage-1, no retry/DLQ): it reads the LATEST
 * AgentExecution per agent for a node plus the live risk/claim/corrective-action
 * registers, so a re-consolidation is idempotent and tolerant of partial or
 * out-of-order agent outputs.
 */
@Injectable()
export class ConsolidationService {
  constructor(
    @InjectRepository(AgentExecution) private readonly executions: Repository<AgentExecution>,
    @InjectRepository(Risk) private readonly risks: Repository<Risk>,
    @InjectRepository(Claim) private readonly claims: Repository<Claim>,
    @InjectRepository(CorrectiveAction) private readonly actions: Repository<CorrectiveAction>,
    @InjectRepository(GovernanceStatusSnapshot) private readonly snapshots: Repository<GovernanceStatusSnapshot>,
  ) {}

  async consolidate(nodeType: string, nodeBusinessKey: string): Promise<ConsolidatedNode> {
    // Latest execution per agentKey for this node.
    const execs = await this.executions.find({
      where: { nodeBusinessKey },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    const latestByAgent = new Map<string, AgentExecution>();
    for (const e of execs) if (!latestByAgent.has(e.agentKey)) latestByAgent.set(e.agentKey, e);

    const agents: AgentRollup[] = [...latestByAgent.values()].map((e) => ({
      agentKey: e.agentKey,
      layer: String(e.agentLayer),
      status: e.status,
      governanceStatus: e.governanceStatus ?? null,
      escalationLevel: e.escalationLevel ?? null,
      confidence: e.confidenceOverall ?? null,
      lastRunAt: e.finishedAt ? e.finishedAt.toISOString() : null,
      summary: null,
    }));

    const latestStatus = await this.snapshots.findOne({
      where: { nodeType, nodeBusinessKey },
      order: { computedAt: 'DESC' },
    });

    // Registers only make sense at project level; roll-ups read 0 here and
    // aggregate via their children's project consolidations in the overview.
    let openRisks = 0, criticalRisks = 0, potentialClaims = 0, openCorrectiveActions = 0;
    let topRisks: ConsolidatedNode['topRisks'] = [];
    if (nodeType === HierarchyLevel.PROJECT) {
      const riskRows = await this.risks.find({ where: { projectBusinessKey: nodeBusinessKey, status: 'open' }, order: { priorityScore: 'DESC' } });
      openRisks = riskRows.length;
      criticalRisks = riskRows.filter((r) => r.tier === 'critical').length;
      topRisks = riskRows.slice(0, 3).map((r) => ({ title: r.title, tier: r.tier, priorityScore: r.priorityScore }));
      potentialClaims = await this.claims.count({ where: { projectBusinessKey: nodeBusinessKey, status: 'potential' } });
    }
    openCorrectiveActions = await this.actions.count({ where: { nodeBusinessKey, status: 'open' } });

    return {
      nodeType,
      nodeBusinessKey,
      governanceStatus: latestStatus?.status ?? null,
      score: latestStatus?.score ?? null,
      agents,
      openCorrectiveActions,
      openRisks,
      criticalRisks,
      potentialClaims,
      topRisks,
    };
  }

  listCorrectiveActions(nodeBusinessKey: string): Promise<CorrectiveAction[]> {
    return this.actions.find({
      where: { nodeBusinessKey },
      order: { priority: 'DESC', createdAt: 'DESC' },
    });
  }
}
