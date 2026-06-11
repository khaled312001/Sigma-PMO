import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentLayer, HierarchyLevel } from '../../common/enums';
import { AgentExecution, ConfidenceScore } from '../canonical/entities';
import {
  AgentDescriptor,
  AgentProcessResult,
  AgentRunContext,
} from '../agents/agent-contract.interface';
import { AgentRegistry } from '../agents/agent.registry';
import { BaseAgentService } from '../agents/base-agent.service';
import { AnalyticsAgentService } from '../analytics/analytics-agent.service';
import { OutboxService } from '../outbox/outbox.service';
import { ConsolidationService } from '../sigma-governance/consolidation.service';

export interface StrategicKpis {
  governanceStatus: string | null;
  scheduleHealth: string;
  costHealth: 'on-budget' | 'watch' | 'over-budget' | 'n/a';
  spi: number | null;
  cpi: number | null;
  projectedCostOverrunPct: number | null;
  riskExposure: number;
  criticalRisks: number;
  potentialClaims: number;
  openCorrectiveActions: number;
}

export interface ExecutivePack {
  nodeBusinessKey: string;
  kpis: StrategicKpis;
  headline: string;
}

/**
 * L7 Executive Intelligence Agent (Mr. Ayham's Layer 7) — transforms the
 * operational agent outputs into executive insight: strategic KPIs, a one-line
 * governance headline, and portfolio-level visibility. Reads (does not
 * recompute) the L4 analytics + L8 consolidation, so it is a cheap, idempotent
 * read agent.
 */
@Injectable()
export class ExecutiveAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    private readonly analytics: AnalyticsAgentService,
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
      agentKey: 'l7.executive',
      layer: AgentLayer.L7_EXECUTIVE,
      objective:
        'Transform operational data into executive insight: dashboards, weekly ' +
        'governance summaries, portfolio visibility and strategic performance indicators.',
      inputs: ['L4 analytics (EVM)', 'L8 consolidation (status, risks, claims, actions)'],
      outputs: ['strategic KPIs', 'governance headline', 'portfolio visibility'],
      ruleReferences: ['PMI performance reporting'],
    };
  }

  async buildPack(projectKey: string): Promise<ExecutivePack> {
    const consolidated = await this.consolidation.consolidate(HierarchyLevel.PROJECT, projectKey);

    let spi: number | null = null, cpi: number | null = null, overrun: number | null = null, scheduleHealth = 'unknown';
    try {
      const a = await this.analytics.computeProject(projectKey);
      spi = a.evm.spi; cpi = a.evm.cpi; overrun = a.forecast.projectedCostOverrunPct;
      scheduleHealth = a.forecast.scheduleHealth;
    } catch {
      // analytics unavailable — KPIs degrade gracefully.
    }

    const costHealth: StrategicKpis['costHealth'] =
      cpi === null ? 'n/a' : cpi >= 1 ? 'on-budget' : cpi >= 0.95 ? 'watch' : 'over-budget';
    const riskExposure = consolidated.topRisks[0]?.priorityScore ?? 0;

    const kpis: StrategicKpis = {
      governanceStatus: consolidated.governanceStatus,
      scheduleHealth,
      costHealth,
      spi,
      cpi,
      projectedCostOverrunPct: overrun,
      riskExposure,
      criticalRisks: consolidated.criticalRisks,
      potentialClaims: consolidated.potentialClaims,
      openCorrectiveActions: consolidated.openCorrectiveActions,
    };

    const headline =
      `${projectKey}: governance ${consolidated.governanceStatus ?? 'n/a'}, schedule ${scheduleHealth}, cost ${costHealth}` +
      (consolidated.criticalRisks > 0 ? `, ${consolidated.criticalRisks} critical risk(s)` : '') +
      (consolidated.potentialClaims > 0 ? `, ${consolidated.potentialClaims} potential claim(s)` : '') + '.';

    return { nodeBusinessKey: projectKey, kpis, headline };
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    if (!projectKey) throw new Error('projectKey/nodeBusinessKey is required for l7.executive');
    const pack = await this.buildPack(projectKey);
    return {
      outputRefs: { ...pack.kpis },
      confidence: { overall: 0.85, breakdown: { rule: 'executive-kpi-v1' } },
      outboxEvents: [
        { eventType: 'reports.executive.generated', payload: { projectKey, headline: pack.headline } },
      ],
      summary: pack.headline,
    };
  }
}
