import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { HierarchyLevel } from '../../common/enums';
import { companyScope } from '../../common/tenant/tenant-context';
import {
  Activity,
  AgentExecution,
  GovernanceStatusSnapshot,
  Project,
} from '../canonical/entities';
import {
  benefitStatusMultiplier,
  HEALTH_SCORE_BASIS,
  projectHealthScore,
} from './health-score';

/**
 * Local, deterministic EVM aggregate. The brief forbids importing the analytics
 * module, so the small PV/EV/AC sums are reimplemented here. This mirrors how
 * `AnalyticsAgentService.computeProject` resolves the project's *current*
 * activities (every version of the businessKey → its current Activity rows).
 */
interface EvmAggregate {
  bac: number;
  pv: number;
  ev: number;
  ac: number;
  spi: number | null;
  cpi: number | null;
  costedActivityCount: number;
}

/** GET /executive/kpis — the executive headline KPIs for one project. */
export interface ExecutiveKpis {
  projectKey: string;
  name: string;
  spi: number | null;
  cpi: number | null;
  /** EVM basis quantities (so the UI can show provenance). */
  evm: { bac: number; pv: number; ev: number; ac: number; costedActivityCount: number };
  governanceStatus: string | null;
  projectHealthScore: number;
  governanceConfidenceScore: number;
  forecastDelayDays: number | null;
  forecastCostOverrunPct: number | null;
  forecastCompletionDate: string | null;
  /** Plain-English provenance of every figure above. */
  basis: Record<string, string>;
}

/** GET /executive/kpis/portfolio — health roll-up across all current projects. */
export interface PortfolioKpis {
  portfolioHealthScore: number;
  worstHealthScore: number;
  projectCount: number;
  projects: Array<{
    projectKey: string;
    name: string;
    healthScore: number;
    governanceStatus: string | null;
  }>;
  basis: Record<string, string>;
}

/** GET /executive/strategic — strategic alignment + benefits realization. */
export interface StrategicKpis {
  projectKey: string;
  strategicObjectiveAlignment: number;
  portfolioValueTracking: {
    totalBAC: number;
    totalEV: number;
    totalAC: number;
    valueDeliveredPct: number;
  };
  benefitsRealizationPct: number;
  enterpriseGovernanceScore: number;
  basis: Record<string, string>;
}

/**
 * ExecutiveKpiService — deterministic executive-layer KPIs computed directly
 * from current canonical rows. Every number has a named basis (deterministic-
 * first); no LLM is involved. Reuses the shared band math in `health-score.ts`
 * so the projects-scores service and this service can never disagree.
 */
@Injectable()
export class ExecutiveKpiService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
    @InjectRepository(GovernanceStatusSnapshot)
    private readonly statusSnapshots: Repository<GovernanceStatusSnapshot>,
    @InjectRepository(AgentExecution) private readonly executions: Repository<AgentExecution>,
  ) {}

  // ───────────────────────── public read endpoints ─────────────────────────

  async computeKpis(projectKey: string): Promise<ExecutiveKpis> {
    const project = await this.currentProject(projectKey);
    const evm = await this.evmForProject(project);
    const governanceStatus = await this.latestStatus(projectKey);
    const confidence = await this.governanceConfidence(projectKey);

    const health = projectHealthScore(governanceStatus, evm.spi, evm.cpi);

    // forecastDelayDays = (1/spi − 1) · plannedElapsedDays, floored at 0.
    const plannedElapsedDays = this.plannedElapsedDays(project);
    const forecastDelayDays =
      evm.spi !== null && evm.spi > 0
        ? Math.round(Math.max(0, (1 / evm.spi - 1) * plannedElapsedDays))
        : null;

    // forecastCostOverrunPct = 1/cpi − 1, expressed as a percent.
    const forecastCostOverrunPct =
      evm.cpi !== null && evm.cpi > 0 ? round1((1 / evm.cpi - 1) * 100) : null;

    const forecastCompletionDate = this.forecastCompletion(project, forecastDelayDays);

    return {
      projectKey,
      name: project.name,
      spi: evm.spi,
      cpi: evm.cpi,
      evm: {
        bac: evm.bac,
        pv: evm.pv,
        ev: evm.ev,
        ac: evm.ac,
        costedActivityCount: evm.costedActivityCount,
      },
      governanceStatus,
      projectHealthScore: health,
      governanceConfidenceScore: confidence,
      forecastDelayDays,
      forecastCostOverrunPct,
      forecastCompletionDate,
      basis: {
        spiCpi:
          'EVM over current activities: EV=Σ(budgetedCost·actualPct), ' +
          'PV=Σ(budgetedCost·plannedPct), AC=Σ(actualCost); SPI=EV/PV, CPI=EV/AC.',
        projectHealthScore: HEALTH_SCORE_BASIS,
        governanceConfidenceScore:
          'avg(AgentExecution.confidenceOverall) over the latest 20 non-null runs for ' +
          'nodeBusinessKey=projectKey; fallback 50 when none.',
        forecastDelayDays:
          `forecastDelayDays = round(max(0,(1/SPI−1)·plannedElapsedDays)), ` +
          `plannedElapsedDays=${plannedElapsedDays} (plannedStart→dataDate/today). null when SPI≤0.`,
        forecastCostOverrunPct:
          'forecastCostOverrunPct = (BAC/CPI−BAC)/BAC = (1/CPI−1)·100, when CPI>0.',
        forecastCompletionDate:
          'forecastCompletionDate = plannedFinish + forecastDelayDays (ISO date).',
      },
    };
  }

  async computePortfolio(): Promise<PortfolioKpis> {
    const projects = await this.projects.find({ where: { isCurrent: true, ...companyScope() }, order: { name: 'ASC' } });
    const list = await Promise.all(
      projects.map(async (p) => {
        const evm = await this.evmForProject(p);
        const status = await this.latestStatus(p.businessKey);
        return {
          projectKey: p.businessKey,
          name: p.name,
          healthScore: projectHealthScore(status, evm.spi, evm.cpi),
          governanceStatus: status,
        };
      }),
    );

    const scores = list.map((p) => p.healthScore);
    const mean = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const worst = scores.length > 0 ? Math.min(...scores) : 0;
    // portfolioHealthScore blends the mean with the worst performer so a single
    // failing project visibly drags the portfolio (60% mean / 40% worst).
    const portfolioHealthScore = Math.round(0.6 * mean + 0.4 * worst);

    return {
      portfolioHealthScore,
      worstHealthScore: Math.round(worst),
      projectCount: list.length,
      projects: list,
      basis: {
        portfolioHealthScore:
          'portfolioHealthScore = round(0.6·mean(projectHealthScore) + 0.4·worst(projectHealthScore)) ' +
          'across all current projects — one failing project drags the portfolio.',
      },
    };
  }

  async computeStrategic(projectKey: string): Promise<StrategicKpis> {
    const project = await this.currentProject(projectKey);
    const status = await this.latestStatus(projectKey);
    const evm = await this.evmForProject(project);

    // strategicObjectiveAlignment 0–100.
    const hasObjective = this.hasBusinessObjective(project);
    let alignment = 0;
    if (hasObjective) alignment += 40;
    const s = (status ?? '').toLowerCase();
    if (s === 'green') alignment += 30;
    else if (s === 'yellow') alignment += 15;
    if (evm.spi !== null && evm.spi >= 0.95) alignment += 30;

    // portfolioValueTracking across ALL current projects (company-scoped).
    const projects = await this.projects.find({ where: { isCurrent: true, ...companyScope() } });
    let totalBAC = 0, totalEV = 0, totalAC = 0;
    for (const p of projects) {
      const e = await this.evmForProject(p);
      totalBAC += e.bac;
      totalEV += e.ev;
      totalAC += e.ac;
    }
    const valueDeliveredPct = totalBAC > 0 ? round1((totalEV / totalBAC) * 100) : 0;

    // benefitsRealizationPct = 100·(EV/BAC)·statusMultiplier (this project's EV/BAC).
    const evToBac = evm.bac > 0 ? evm.ev / evm.bac : 0;
    const benefitsRealizationPct = Math.round(100 * evToBac * benefitStatusMultiplier(status));

    const enterpriseGovernanceScore = await this.enterpriseGovernanceScore();

    return {
      projectKey,
      strategicObjectiveAlignment: alignment,
      portfolioValueTracking: {
        totalBAC: round2(totalBAC),
        totalEV: round2(totalEV),
        totalAC: round2(totalAC),
        valueDeliveredPct,
      },
      benefitsRealizationPct,
      enterpriseGovernanceScore,
      basis: {
        strategicObjectiveAlignment:
          'strategic-alignment-v1: hasBusinessObjective +40; governanceStatus green +30 / yellow +15; SPI≥0.95 +30 (0–100).',
        portfolioValueTracking:
          'Σ over all current projects: totalBAC, totalEV, totalAC; valueDeliveredPct = totalEV/totalBAC.',
        benefitsRealizationPct:
          'benefit-realization-v1 (platform heuristic): round(100·(EV/BAC)·statusMultiplier), ' +
          'statusMultiplier green 1.0 / yellow .85 / orange .6 / red .4 / none .7.',
        enterpriseGovernanceScore:
          'mean of latest GovernanceStatusSnapshot score across enterprise+portfolio nodes ' +
          '(score is [0,1] where 0=healthy → mapped to 100·(1−score)); fallback: across projects.',
      },
    };
  }

  // ───────────────────────── deterministic helpers ─────────────────────────

  private async currentProject(projectKey: string): Promise<Project> {
    // Multi-tenant: only resolve a project the caller's company owns — a foreign
    // key 404s here (the dashboard KPI tiles then fall back to "—").
    const project = await this.projects.findOne({
      where: { businessKey: projectKey, isCurrent: true, ...companyScope() },
    });
    if (!project) throw new NotFoundException(`No current project "${projectKey}"`);
    return project;
  }

  /**
   * Resolve the project's current activities (across every version of the
   * businessKey, mirroring SnapshotService) and reduce to EVM aggregates.
   */
  private async evmForProject(project: Project): Promise<EvmAggregate> {
    const versions = await this.projects.find({
      where: { businessKey: project.businessKey },
      select: { id: true },
    });
    const projectIds = versions.map((v) => v.id);
    const activities =
      projectIds.length === 0
        ? []
        : await this.activities.find({ where: { projectId: In(projectIds), isCurrent: true } });

    let bac = 0, pv = 0, ev = 0, ac = 0, costed = 0;
    for (const a of activities) {
      const budget = num(a.budgetedCost);
      const actual = num(a.actualCost);
      const planned = clamp01(num(a.plannedPctComplete));
      const earned = clamp01(num(a.actualPctComplete));
      if (budget > 0) costed += 1;
      bac += budget;
      pv += budget * planned;
      ev += budget * earned;
      ac += actual;
    }
    const spi = pv > 0 ? ev / pv : null;
    const cpi = ac > 0 ? ev / ac : null;
    return {
      bac: round2(bac),
      pv: round2(pv),
      ev: round2(ev),
      ac: round2(ac),
      spi: spi === null ? null : round3(spi),
      cpi: cpi === null ? null : round3(cpi),
      costedActivityCount: costed,
    };
  }

  /** Latest governance status tier for a project node (null when none). */
  private async latestStatus(projectKey: string): Promise<string | null> {
    const snap = await this.statusSnapshots.findOne({
      where: { nodeType: HierarchyLevel.PROJECT, nodeBusinessKey: projectKey },
      order: { computedAt: 'DESC' },
    });
    return snap?.status ?? null;
  }

  /** avg of the latest 20 non-null AgentExecution confidences for the node; 50 fallback. */
  private async governanceConfidence(projectKey: string): Promise<number> {
    const rows = await this.executions.find({
      where: { nodeBusinessKey: projectKey },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    const vals = rows
      .map((r) => r.confidenceOverall)
      .filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v))
      .slice(0, 20);
    if (vals.length === 0) return 50;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.round(mean * 100);
  }

  /** Days from project plannedStart to its dataDate (or today). Floored at 0. */
  private plannedElapsedDays(project: Project): number {
    const start = parseDate(project.plannedStart);
    if (!start) return 0;
    const asOf = parseDate(project.dataDate) ?? new Date();
    const days = Math.round((asOf.getTime() - start.getTime()) / DAY_MS);
    return Math.max(0, days);
  }

  /** plannedFinish + forecastDelayDays as an ISO date (null when no baseline). */
  private forecastCompletion(project: Project, delayDays: number | null): string | null {
    const finish = parseDate(project.plannedFinish);
    if (!finish) return null;
    const d = new Date(finish.getTime() + (delayDays ?? 0) * DAY_MS);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Mean enterprise/portfolio governance score (100·(1−score)) from the latest
   * snapshot per node. Falls back to project nodes when no roll-up node exists.
   */
  private async enterpriseGovernanceScore(): Promise<number> {
    const rollupScores = await this.latestScoresForTypes([
      HierarchyLevel.ENTERPRISE,
      HierarchyLevel.PORTFOLIO,
    ]);
    const source = rollupScores.length > 0
      ? rollupScores
      : await this.latestScoresForTypes([HierarchyLevel.PROJECT]);
    if (source.length === 0) return 50;
    const meanScore = source.reduce((a, b) => a + b, 0) / source.length;
    return Math.round(100 * clamp01(1 - meanScore));
  }

  /** Latest snapshot score [0,1] per node, for the given node types. */
  private async latestScoresForTypes(types: string[]): Promise<number[]> {
    const rows = await this.statusSnapshots.find({
      where: { nodeType: In(types) },
      order: { computedAt: 'DESC' },
      take: 500,
    });
    const latestByNode = new Map<string, number>();
    for (const r of rows) {
      const key = `${r.nodeType}:${r.nodeBusinessKey}`;
      if (!latestByNode.has(key)) latestByNode.set(key, r.score);
    }
    return [...latestByNode.values()].filter((v) => Number.isFinite(v));
  }

  /**
   * Whether the project carries a stated business objective. The canonical
   * Project entity has no dedicated column, so we look in its preserved
   * `rawSource` for any of the common keys ingestion may have captured.
   */
  private hasBusinessObjective(project: Project): boolean {
    const raw = (project.rawSource ?? {}) as Record<string, unknown>;
    for (const key of ['businessObjective', 'objective', 'strategicObjective', 'goal']) {
      const v = raw[key];
      if (typeof v === 'string' && v.trim().length > 0) return true;
    }
    return false;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}
function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;
