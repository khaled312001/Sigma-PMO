import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { HierarchyLevel } from '../../common/enums';
import {
  Activity,
  FeasibilityAssessment,
  GovernanceStatusSnapshot,
  Project,
  Risk,
} from './entities';

/**
 * The additive score bundle the `/projects` listing gains. Every existing
 * field on the project response stays untouched; these are computed on read,
 * deterministically, from current canonical rows.
 */
export interface ProjectScores {
  governanceScore: number; // statusPts·100
  riskScore: number; // 0–100 (higher = more risk)
  healthScore: number; // shared health-score band math
  investmentScore: number | null; // attractivenessScore of a matched feasibility run, else null
  compositeScore: number; // 0.4·gov + 0.3·(100−risk) + 0.3·health
  projectRanking: number; // 1..N by compositeScore desc
  portfolioRanking: number; // rank within the same portfolio grouping
}

/** Internal per-project EVM aggregate (local reimplementation, no analytics import). */
interface EvmLite {
  spi: number | null;
  cpi: number | null;
}

/**
 * ProjectsScoresService — deterministic per-project scores + rankings for the
 * `/projects` listing. Mirrors the health-score band math used by the executive
 * KPI service via a local copy of the same formula (the two live in different
 * modules; the formula is documented once in modules/executive/health-score.ts).
 */
@Injectable()
export class ProjectsScoresService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
    @InjectRepository(Risk) private readonly risks: Repository<Risk>,
    @InjectRepository(GovernanceStatusSnapshot)
    private readonly statusSnapshots: Repository<GovernanceStatusSnapshot>,
    @InjectRepository(FeasibilityAssessment)
    private readonly assessments: Repository<FeasibilityAssessment>,
  ) {}

  /**
   * Compute the score bundle for every current project, keyed by businessKey.
   * Rankings are derived across the whole set so the controller can decorate
   * each row in a single pass.
   */
  async scoreAll(projects: Project[]): Promise<Map<string, ProjectScores>> {
    // Pre-resolve per-project pieces.
    const partials = await Promise.all(
      projects.map(async (p) => {
        const evm = await this.evmForProject(p);
        const status = await this.latestStatus(p.businessKey);
        const governanceScore = Math.round(statusPoints(status) * 100);
        const riskScore = await this.riskScore(p.businessKey);
        const healthScore = projectHealthScore(status, evm.spi, evm.cpi);
        const investmentScore = await this.investmentScore(p.businessKey);
        const compositeScore = Math.round(
          0.4 * governanceScore + 0.3 * (100 - riskScore) + 0.3 * healthScore,
        );
        return {
          businessKey: p.businessKey,
          portfolioGroup: p.portfolioBusinessKey ?? null,
          governanceScore,
          riskScore,
          healthScore,
          investmentScore,
          compositeScore,
        };
      }),
    );

    // Project-wide ranking: 1..N by compositeScore desc (ties → stable by order).
    const byComposite = [...partials].sort((a, b) => b.compositeScore - a.compositeScore);
    const projectRank = new Map<string, number>();
    byComposite.forEach((p, i) => projectRank.set(p.businessKey, i + 1));

    // Portfolio ranking: rank within the same portfolioBusinessKey grouping.
    // Projects with no portfolio fall back to their project-wide rank.
    const portfolioRank = new Map<string, number>();
    const groups = new Map<string, typeof partials>();
    for (const p of partials) {
      if (!p.portfolioGroup) continue;
      const arr = groups.get(p.portfolioGroup) ?? [];
      arr.push(p);
      groups.set(p.portfolioGroup, arr);
    }
    for (const arr of groups.values()) {
      arr
        .slice()
        .sort((a, b) => b.compositeScore - a.compositeScore)
        .forEach((p, i) => portfolioRank.set(p.businessKey, i + 1));
    }

    const result = new Map<string, ProjectScores>();
    for (const p of partials) {
      result.set(p.businessKey, {
        governanceScore: p.governanceScore,
        riskScore: p.riskScore,
        healthScore: p.healthScore,
        investmentScore: p.investmentScore,
        compositeScore: p.compositeScore,
        projectRanking: projectRank.get(p.businessKey) ?? 0,
        portfolioRanking: portfolioRank.get(p.businessKey) ?? projectRank.get(p.businessKey) ?? 0,
      });
    }
    return result;
  }

  // ───────────────────────── deterministic helpers ─────────────────────────

  private async evmForProject(project: Project): Promise<EvmLite> {
    const versions = await this.projects.find({
      where: { businessKey: project.businessKey },
      select: { id: true },
    });
    const projectIds = versions.map((v) => v.id);
    const activities =
      projectIds.length === 0
        ? []
        : await this.activities.find({ where: { projectId: In(projectIds), isCurrent: true } });

    let pv = 0, ev = 0, ac = 0;
    for (const a of activities) {
      const budget = num(a.budgetedCost);
      const actual = num(a.actualCost);
      const planned = clamp01(num(a.plannedPctComplete));
      const earned = clamp01(num(a.actualPctComplete));
      pv += budget * planned;
      ev += budget * earned;
      ac += actual;
    }
    return {
      spi: pv > 0 ? round3(ev / pv) : null,
      cpi: ac > 0 ? round3(ev / ac) : null,
    };
  }

  private async latestStatus(projectKey: string): Promise<string | null> {
    const snap = await this.statusSnapshots.findOne({
      where: { nodeType: HierarchyLevel.PROJECT, nodeBusinessKey: projectKey },
      order: { computedAt: 'DESC' },
    });
    return snap?.status ?? null;
  }

  /**
   * riskScore 0–100: Σ priorityScore of current OPEN risks for the project,
   * scaled to a 0–100 band and capped. priorityScore is probability·impact in
   * [0,1]; ~5 maxed-out open risks saturate the bar (×20, capped at 100).
   */
  private async riskScore(projectKey: string): Promise<number> {
    const rows = await this.risks.find({
      where: { projectBusinessKey: projectKey, status: 'open' },
    });
    const sum = rows.reduce((acc, r) => acc + (Number.isFinite(r.priorityScore) ? r.priorityScore : 0), 0);
    return Math.min(100, Math.round(sum * 20));
  }

  /**
   * investmentScore: attractivenessScore of the most recent FeasibilityAssessment
   * whose snapshot inputs.structured?.projectKey matches this project. There is
   * no hard FK from a feasibility opportunity to a delivery project, so the only
   * honest link is an explicit projectKey stamped into the assessment inputs.
   * When none matches → null (the UI shows "—").
   */
  private async investmentScore(projectKey: string): Promise<number | null> {
    const rows = await this.assessments.find({
      order: { createdAt: 'DESC' },
      take: 200,
    });
    for (const a of rows) {
      const inputs = (a.inputs ?? {}) as Record<string, unknown>;
      const structured = (inputs.structured ?? {}) as Record<string, unknown>;
      if (structured.projectKey === projectKey || inputs.projectKey === projectKey) {
        const results = (a.results ?? {}) as Record<string, unknown>;
        const score = results.attractivenessScore;
        if (typeof score === 'number' && Number.isFinite(score)) return Math.round(score);
      }
    }
    return null;
  }
}

// ── Shared band math (kept in sync with modules/executive/health-score.ts) ──
// Re-declared locally because canonical/ must not depend on the executive
// module. The formula is identical: a unit test in executive/ pins the math.

function statusPoints(status: string | null | undefined): number {
  switch ((status ?? '').toLowerCase()) {
    case 'green': return 1;
    case 'yellow': return 0.66;
    case 'orange': return 0.33;
    case 'red': return 0;
    default: return 0.5;
  }
}
function indexPoints(index: number | null | undefined): number {
  if (index === null || index === undefined || !Number.isFinite(index)) return 0.5;
  return clamp01((index - 0.7) / 0.4);
}
function projectHealthScore(
  status: string | null | undefined,
  spi: number | null | undefined,
  cpi: number | null | undefined,
): number {
  return Math.round(40 * statusPoints(status) + 30 * indexPoints(spi) + 30 * indexPoints(cpi));
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const round3 = (n: number): number => Math.round(n * 1000) / 1000;
