import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { HierarchyLevel } from '../../common/enums';
import {
  Activity,
  Claim,
  Enterprise,
  GovernanceStatusSnapshot,
  Portfolio,
  Program,
  Project,
  Risk,
} from '../canonical/entities';
import {
  ProjectRollupMetrics,
  aggregateChildren,
  benefitRealizationPct,
  safeIndex,
} from './rollup-math';

/** One node's roll-up row as returned by `GET /hierarchy/rollups`. */
export interface RollupNode {
  nodeType: string;
  businessKey: string;
  name: string;
  governanceStatus: string | null;
  cost: { cpi: number | null };
  schedule: { spi: number | null };
  risk: { openCount: number; maxScore: number };
  claims: { openCount: number; exposure: number };
  benefitRealizationPct: number;
  /** Total BAC backing the weighted indices (handy for tooltips). */
  bac: number;
}

export interface RollupsResponse {
  nodes: RollupNode[];
  computedAt: string;
}

/**
 * RollupService — the read side of `GET /hierarchy/rollups`. For every node in
 * the governance tree it produces a compact metrics row (CPI, SPI, open risks,
 * open claims + exposure, benefit-realization %). Projects are computed
 * directly from their canonical Activity / Risk / Claim rows; parents aggregate
 * their children BAC-weighted for the indices + benefit and summed for the
 * registers (see `rollup-math.ts`, which is pure + unit-tested).
 *
 * Deterministic-first: the EVM math is re-implemented locally (PMI EV/PV/AC
 * formulas) rather than importing the analytics agent, so this surface has no
 * cross-module runtime dependency.
 */
@Injectable()
export class RollupService {
  constructor(
    @InjectRepository(Enterprise) private readonly enterprises: Repository<Enterprise>,
    @InjectRepository(Portfolio) private readonly portfolios: Repository<Portfolio>,
    @InjectRepository(Program) private readonly programs: Repository<Program>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
    @InjectRepository(Risk) private readonly risks: Repository<Risk>,
    @InjectRepository(Claim) private readonly claims: Repository<Claim>,
    @InjectRepository(GovernanceStatusSnapshot)
    private readonly snapshots: Repository<GovernanceStatusSnapshot>,
  ) {}

  async rollups(): Promise<RollupsResponse> {
    const [enterprises, portfolios, programs, projects] = await Promise.all([
      this.enterprises.find({ where: { isCurrent: true } }),
      this.portfolios.find({ where: { isCurrent: true } }),
      this.programs.find({ where: { isCurrent: true } }),
      this.projects.find({ where: { isCurrent: true } }),
    ]);

    // 1) Compute every project's leaf metrics directly from canonical rows.
    const projMetrics = new Map<string, ProjectRollupMetrics>();
    const projName = new Map<string, string>();
    await Promise.all(
      projects.map(async (p) => {
        projName.set(p.businessKey, p.name);
        projMetrics.set(p.businessKey, await this.projectMetrics(p));
      }),
    );

    const nodes: RollupNode[] = [];
    for (const p of projects) {
      nodes.push(this.toNode(HierarchyLevel.PROJECT, p.businessKey, p.name, projMetrics.get(p.businessKey)!));
    }

    // 2) Programs aggregate their child projects (BAC-weighted).
    const progMetrics = new Map<string, ProjectRollupMetrics>();
    for (const pr of programs) {
      const children = projects
        .filter((p) => p.programBusinessKey === pr.businessKey)
        .map((p) => projMetrics.get(p.businessKey)!)
        .filter(Boolean);
      const ownStatus = await this.ownSnapshotStatus(HierarchyLevel.PROGRAM, pr.businessKey);
      const m = aggregateChildren(children, ownStatus ?? pr.governanceStatus ?? null);
      progMetrics.set(pr.businessKey, m);
      nodes.push(this.toNode(HierarchyLevel.PROGRAM, pr.businessKey, pr.name, m));
    }

    // 3) Portfolios aggregate their child programs.
    const portMetrics = new Map<string, ProjectRollupMetrics>();
    for (const pf of portfolios) {
      const children = programs
        .filter((pr) => pr.portfolioBusinessKey === pf.businessKey)
        .map((pr) => progMetrics.get(pr.businessKey)!)
        .filter(Boolean);
      const ownStatus = await this.ownSnapshotStatus(HierarchyLevel.PORTFOLIO, pf.businessKey);
      const m = aggregateChildren(children, ownStatus ?? pf.governanceStatus ?? null);
      portMetrics.set(pf.businessKey, m);
      nodes.push(this.toNode(HierarchyLevel.PORTFOLIO, pf.businessKey, pf.name, m));
    }

    // 4) Enterprises aggregate their child portfolios.
    for (const e of enterprises) {
      const children = portfolios
        .filter((pf) => pf.enterpriseBusinessKey === e.businessKey)
        .map((pf) => portMetrics.get(pf.businessKey)!)
        .filter(Boolean);
      const ownStatus = await this.ownSnapshotStatus(HierarchyLevel.ENTERPRISE, e.businessKey);
      const m = aggregateChildren(children, ownStatus ?? e.governanceStatus ?? null);
      nodes.push(this.toNode(HierarchyLevel.ENTERPRISE, e.businessKey, e.name, m));
    }

    return { nodes, computedAt: new Date().toISOString() };
  }

  // ───────────────────────── per-project leaf metrics ─────────────────────────

  /** Compute one project's EVM + register metrics from its canonical rows. */
  async projectMetrics(project: Project): Promise<ProjectRollupMetrics> {
    // Gather every version-id of this businessKey so activities ingested
    // against an earlier project version are still counted (matches Snapshot).
    const versions = await this.projects.find({
      where: { businessKey: project.businessKey },
      select: { id: true },
    });
    const projectIds = versions.map((v) => v.id);
    const acts = projectIds.length
      ? await this.activities.find({ where: { projectId: In(projectIds), isCurrent: true } })
      : [];

    let bac = 0;
    let pv = 0;
    let ev = 0;
    let ac = 0;
    for (const a of acts) {
      const budget = num(a.budgetedCost);
      const actual = num(a.actualCost);
      const planned = clamp01(a.plannedPctComplete);
      const earned = clamp01(a.actualPctComplete);
      bac += budget;
      pv += budget * planned;
      ev += budget * earned;
      ac += actual;
    }

    const [openRisks, openClaims] = await Promise.all([
      this.risks.find({ where: { projectBusinessKey: project.businessKey, status: 'open' } }),
      this.claims.find({ where: { projectBusinessKey: project.businessKey, status: 'potential' } }),
    ]);
    const maxRiskScore = openRisks.reduce((m, r) => Math.max(m, r.priorityScore ?? 0), 0);
    const claimExposure = openClaims.reduce((s, c) => s + num(c.estimatedAmount), 0);

    const status = project.governanceStatus ?? null;
    return {
      bac: round2(bac),
      ev: round2(ev),
      pv: round2(pv),
      ac: round2(ac),
      spi: safeIndex(ev, pv),
      cpi: safeIndex(ev, ac),
      governanceStatus: status,
      openRiskCount: openRisks.length,
      maxRiskScore: Math.round(maxRiskScore * 1000) / 1000,
      openClaimCount: openClaims.length,
      claimExposure: round2(claimExposure),
      benefitRealizationPct: benefitRealizationPct(ev, bac, status),
    };
  }

  private async ownSnapshotStatus(nodeType: string, nodeBusinessKey: string): Promise<string | null> {
    const snap = await this.snapshots.findOne({
      where: { nodeType, nodeBusinessKey },
      order: { computedAt: 'DESC' },
    });
    return snap?.status ?? null;
  }

  private toNode(
    nodeType: string,
    businessKey: string,
    name: string,
    m: ProjectRollupMetrics,
  ): RollupNode {
    return {
      nodeType,
      businessKey,
      name,
      governanceStatus: m.governanceStatus,
      cost: { cpi: m.cpi },
      schedule: { spi: m.spi },
      risk: { openCount: m.openRiskCount, maxScore: m.maxRiskScore },
      claims: { openCount: m.openClaimCount, exposure: m.claimExposure },
      benefitRealizationPct: m.benefitRealizationPct,
      bac: m.bac,
    };
  }
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}
const clamp01 = (v: number | null | undefined): number => {
  const n = num(v);
  return Math.max(0, Math.min(1, n));
};
const round2 = (n: number): number => Math.round(n * 100) / 100;
