import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentLayer, HierarchyLevel } from '../../common/enums';
import {
  AgentExecution,
  AnalyticsSnapshot,
  ConfidenceScore,
  Project,
} from '../canonical/entities';
import {
  AgentDescriptor,
  AgentProcessResult,
  AgentRunContext,
} from '../agents/agent-contract.interface';
import { AgentRegistry } from '../agents/agent.registry';
import { BaseAgentService } from '../agents/base-agent.service';
import { OutboxService } from '../outbox/outbox.service';
import { SnapshotService } from '../rules/snapshot.service';
import { EvmResult, EvmService } from './evm.service';

export interface ProductivityKpis {
  activityCount: number;
  completedCount: number;
  inProgressCount: number;
  notStartedCount: number;
  avgPlannedPct: number;
  avgActualPct: number;
  progressDeltaPct: number;
  completionRate: number;
}

export interface ForecastResult {
  /** SPI-projected: a slip factor applied to remaining work. */
  scheduleHealth: 'on-track' | 'at-risk' | 'slipping';
  /** EAC overrun vs BAC as a percentage (negative = under budget). */
  projectedCostOverrunPct: number | null;
  note: string;
}

export interface AnalyticsResult {
  nodeType: string;
  nodeBusinessKey: string;
  evm: EvmResult;
  productivity: ProductivityKpis;
  forecast: ForecastResult;
}

/**
 * L4 Analytics Agent (Mr. Ayham's Layer 4) — performance, productivity, cost,
 * schedule forecasting, EVM, trend and portfolio analytics. Deterministic: the
 * EVM math and KPIs come from canonical activity rows, not an LLM. Persists an
 * append-only `AnalyticsSnapshot` so trend/forecast views read a time series.
 */
@Injectable()
export class AnalyticsAgentService extends BaseAgentService implements OnModuleInit {
  constructor(
    @InjectRepository(AgentExecution) executions: Repository<AgentExecution>,
    @InjectRepository(ConfidenceScore) confidences: Repository<ConfidenceScore>,
    outbox: OutboxService,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(AnalyticsSnapshot) private readonly snapshots: Repository<AnalyticsSnapshot>,
    private readonly snapshotSvc: SnapshotService,
    private readonly evm: EvmService,
    private readonly registry: AgentRegistry,
  ) {
    super({ executions, confidences, outbox });
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  describe(): AgentDescriptor {
    return {
      agentKey: 'l4.analytics',
      layer: AgentLayer.L4_ANALYTICS,
      objective:
        'Performance, productivity and cost analysis, schedule forecasting, ' +
        'Earned-Value indicators, trend and portfolio analytics.',
      inputs: ['canonical activities (budget, planned/actual %, cost)', 'hierarchy (for portfolio roll-up)'],
      outputs: ['EVM (SPI/CPI/EAC/VAC)', 'productivity KPIs', 'schedule + cost forecast'],
      ruleReferences: ['PMI Earned Value Management', 'AACE 17R-97', 'AACE 29R-03'],
    };
  }

  /** Compute analytics for one project (pure read + deterministic math). */
  async computeProject(projectKey: string): Promise<AnalyticsResult> {
    const project = await this.projects.findOne({
      where: { businessKey: projectKey, isCurrent: true },
    });
    if (!project) throw new NotFoundException(`No current project "${projectKey}"`);
    const snap = await this.snapshotSvc.load(project.id);

    const evm = this.evm.compute(
      snap.activities.map((a) => ({
        budgetedCost: a.budgetedCost === null ? null : Number.parseFloat(a.budgetedCost),
        actualCost: a.actualCost === null ? null : Number.parseFloat(a.actualCost),
        plannedPctComplete: a.plannedPctComplete,
        actualPctComplete: a.actualPctComplete,
      })),
    );

    const productivity = this.productivity(snap.activities);
    const forecast = this.forecast(evm, productivity);
    return { nodeType: HierarchyLevel.PROJECT, nodeBusinessKey: projectKey, evm, productivity, forecast };
  }

  /** Portfolio/program roll-up: aggregate EVM across child projects. */
  async computePortfolio(programOrPortfolioKey: string, level: HierarchyLevel): Promise<AnalyticsResult & { childCount: number }> {
    const where = level === HierarchyLevel.PROGRAM
      ? { programBusinessKey: programOrPortfolioKey, isCurrent: true as const }
      : { portfolioBusinessKey: programOrPortfolioKey, isCurrent: true as const };
    const children = await this.projects.find({ where });

    const childResults = await Promise.all(children.map((c) => this.computeProject(c.businessKey)));
    // Aggregate EVM by summing the additive quantities, then re-derive indices.
    const agg = childResults.reduce(
      (acc, r) => {
        acc.bac += r.evm.bac; acc.pv += r.evm.pv; acc.ev += r.evm.ev; acc.ac += r.evm.ac;
        acc.costed += r.evm.costedActivityCount;
        return acc;
      },
      { bac: 0, pv: 0, ev: 0, ac: 0, costed: 0 },
    );
    const spi = agg.pv > 0 ? agg.ev / agg.pv : null;
    const cpi = agg.ac > 0 ? agg.ev / agg.ac : null;
    const eac = cpi && cpi > 0 ? agg.bac / cpi : null;
    const evm: EvmResult = {
      bac: round(agg.bac), pv: round(agg.pv), ev: round(agg.ev), ac: round(agg.ac),
      sv: round(agg.ev - agg.pv), cv: round(agg.ev - agg.ac),
      spi: spi === null ? null : round3(spi), cpi: cpi === null ? null : round3(cpi),
      eac: eac === null ? null : round(eac),
      etc: eac === null ? null : round(eac - agg.ac),
      vac: eac === null ? null : round(agg.bac - eac),
      costedActivityCount: agg.costed,
    };
    const productivity = childResults.reduce<ProductivityKpis>(
      (acc, r) => ({
        activityCount: acc.activityCount + r.productivity.activityCount,
        completedCount: acc.completedCount + r.productivity.completedCount,
        inProgressCount: acc.inProgressCount + r.productivity.inProgressCount,
        notStartedCount: acc.notStartedCount + r.productivity.notStartedCount,
        avgPlannedPct: 0, avgActualPct: 0, progressDeltaPct: 0, completionRate: 0,
      }),
      { activityCount: 0, completedCount: 0, inProgressCount: 0, notStartedCount: 0, avgPlannedPct: 0, avgActualPct: 0, progressDeltaPct: 0, completionRate: 0 },
    );
    productivity.completionRate = productivity.activityCount > 0
      ? round3(productivity.completedCount / productivity.activityCount) : 0;
    const forecast = this.forecast(evm, productivity);
    return {
      nodeType: level, nodeBusinessKey: programOrPortfolioKey,
      evm, productivity, forecast, childCount: children.length,
    };
  }

  protected async process(ctx: AgentRunContext): Promise<AgentProcessResult> {
    const projectKey = ctx.nodeBusinessKey ?? ctx.projectKey;
    if (!projectKey) throw new Error('projectKey/nodeBusinessKey is required for l4.analytics');
    const result = await this.computeProject(projectKey);

    await this.snapshots.save(
      this.snapshots.create({
        nodeType: result.nodeType,
        nodeBusinessKey: projectKey,
        evm: result.evm as unknown as Record<string, unknown>,
        productivity: result.productivity as unknown as Record<string, unknown>,
        forecast: result.forecast as unknown as Record<string, unknown>,
        computedAt: new Date(),
      }),
    );

    // Analytics confidence reflects how much of the schedule is costed (EVM is
    // only meaningful where budgets exist).
    const coverage = result.productivity.activityCount > 0
      ? result.evm.costedActivityCount / result.productivity.activityCount : 0;
    const confidence = Math.max(0.4, Math.min(1, coverage + 0.3));

    return {
      outputRefs: {
        spi: result.evm.spi, cpi: result.evm.cpi, eac: result.evm.eac, vac: result.evm.vac,
        scheduleHealth: result.forecast.scheduleHealth,
      },
      confidence: { overall: round3(confidence), breakdown: { costCoverage: round3(coverage), rule: 'analytics-coverage-v1' } },
      outboxEvents: [
        {
          eventType: 'agent.l4.analytics.completed',
          payload: { projectKey, spi: result.evm.spi, cpi: result.evm.cpi, scheduleHealth: result.forecast.scheduleHealth },
        },
      ],
      summary: `Analytics ${projectKey}: SPI ${fmt(result.evm.spi)}, CPI ${fmt(result.evm.cpi)}, ${result.forecast.scheduleHealth}.`,
    };
  }

  // ───────────────────────── deterministic KPI helpers ─────────────────────────

  private productivity(activities: Array<{ plannedPctComplete: number | null; actualPctComplete: number | null }>): ProductivityKpis {
    const n = activities.length;
    let completed = 0, inProgress = 0, notStarted = 0, sumPlanned = 0, sumActual = 0, plannedN = 0, actualN = 0;
    for (const a of activities) {
      const ap = a.actualPctComplete ?? 0;
      if (ap >= 1) completed += 1;
      else if (ap > 0) inProgress += 1;
      else notStarted += 1;
      if (a.plannedPctComplete !== null) { sumPlanned += a.plannedPctComplete; plannedN += 1; }
      if (a.actualPctComplete !== null) { sumActual += a.actualPctComplete; actualN += 1; }
    }
    const avgPlanned = plannedN > 0 ? sumPlanned / plannedN : 0;
    const avgActual = actualN > 0 ? sumActual / actualN : 0;
    return {
      activityCount: n,
      completedCount: completed,
      inProgressCount: inProgress,
      notStartedCount: notStarted,
      avgPlannedPct: round3(avgPlanned * 100),
      avgActualPct: round3(avgActual * 100),
      progressDeltaPct: round3((avgActual - avgPlanned) * 100),
      completionRate: n > 0 ? round3(completed / n) : 0,
    };
  }

  private forecast(evm: EvmResult, prod: ProductivityKpis): ForecastResult {
    const spi = evm.spi;
    let scheduleHealth: ForecastResult['scheduleHealth'] = 'on-track';
    if (spi !== null) {
      if (spi < 0.9) scheduleHealth = 'slipping';
      else if (spi < 0.97) scheduleHealth = 'at-risk';
    } else if (prod.progressDeltaPct < -10) {
      scheduleHealth = 'slipping';
    } else if (prod.progressDeltaPct < -3) {
      scheduleHealth = 'at-risk';
    }
    const projectedCostOverrunPct = evm.eac !== null && evm.bac > 0
      ? round3(((evm.eac - evm.bac) / evm.bac) * 100) : null;
    const note = spi !== null
      ? `SPI ${fmt(spi)} drives the schedule outlook; ` +
        (projectedCostOverrunPct !== null ? `EAC implies ${projectedCostOverrunPct >= 0 ? '+' : ''}${projectedCostOverrunPct}% vs budget.` : 'no cost baseline to forecast against.')
      : 'No cost baseline — schedule outlook from planned-vs-actual progress delta.';
    return { scheduleHealth, projectedCostOverrunPct, note };
  }
}

const round = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const fmt = (n: number | null): string => (n === null ? 'n/a' : n.toFixed(3));
