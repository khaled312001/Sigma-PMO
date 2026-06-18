import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { companyScope } from '../../common/tenant/tenant-context';
import { Project, Risk } from '../canonical/entities';
import {
  MatchedMitigations,
  MITIGATION_LIBRARY_VERSION,
  matchMitigations,
} from './mitigation-library';

export interface RiskWithMitigations {
  risk: Risk;
  mitigation: MatchedMitigations;
}
export interface MitigationsResult {
  projectKey: string;
  source: string;
  openRiskCount: number;
  rows: RiskWithMitigations[];
}

export interface CorrelationCell {
  a: string;
  b: string;
  count: number;
}
export interface SharedSourceGroup {
  source: string;
  riskIds: string[];
  titles: string[];
}
export interface CorrelationResult {
  projectKey: string;
  categories: string[];
  /** Symmetric co-occurrence matrix: categories[i][j] = # risks sharing both. */
  matrix: number[][];
  /** Flat pairwise counts (upper triangle, count > 0). */
  pairs: CorrelationCell[];
  /** Risks that cite the same source signal (same activity/rule reference). */
  sharedSourceGroups: SharedSourceGroup[];
  /** Named clusters derived from the strongest links. */
  clusters: Array<{ name: string; categories: string[]; riskCount: number }>;
  basis: string;
}

export interface PortfolioRiskProjectRow {
  projectKey: string;
  name: string;
  programBusinessKey: string | null;
  portfolioBusinessKey: string | null;
  openRiskCount: number;
  sumScore: number;
  maxScore: number;
  topTier: string | null;
}
export interface PortfolioRiskGroup {
  groupBy: 'portfolio' | 'program';
  key: string;
  openRiskCount: number;
  sumScore: number;
  maxScore: number;
  projectCount: number;
}
export interface PortfolioRiskResult {
  projectCount: number;
  totals: { openRiskCount: number; sumScore: number; maxScore: number };
  rows: PortfolioRiskProjectRow[];
  byPortfolio: PortfolioRiskGroup[];
  byProgram: PortfolioRiskGroup[];
  basis: string;
}

/**
 * RiskExtrasService — L5 extensions beyond the base risk agent:
 *  - mitigation matching from the deterministic mitigation-library,
 *  - pairwise category co-occurrence + shared-signal correlation,
 *  - whole-estate portfolio risk roll-up grouped by portfolio/program.
 *
 * Deterministic throughout (no LLM): mitigations are a rule-based lookup,
 * correlation is a count over the register, and the portfolio roll-up is a
 * grouped aggregate over the canonical Risk rows.
 */
@Injectable()
export class RiskExtrasService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Risk) private readonly risks: Repository<Risk>,
  ) {}

  /** Open risks, each with 2–3 matched mitigation options. */
  async mitigations(projectKey: string): Promise<MitigationsResult> {
    const open = await this.risks.find({
      where: { projectBusinessKey: projectKey, status: In(['open', 'mitigating']) },
      order: { priorityScore: 'DESC' },
    });
    return {
      projectKey,
      source: MITIGATION_LIBRARY_VERSION,
      openRiskCount: open.length,
      rows: open.map((risk) => ({ risk, mitigation: matchMitigations(risk.category, risk.tier) })),
    };
  }

  /** Pairwise category co-occurrence + shared-signal clusters for one project. */
  async correlation(projectKey: string): Promise<CorrelationResult> {
    const rows = await this.risks.find({
      where: { projectBusinessKey: projectKey, status: In(['open', 'mitigating']) },
    });

    const categories = [...new Set(rows.map((r) => r.category))].sort();
    const index = new Map(categories.map((c, i) => [c, i]));
    const n = categories.length;
    const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

    // Diagonal = count per category; off-diagonal = co-occurrence within the
    // same source signal (risks that were raised by the same rule/EVM index).
    for (const c of categories) {
      const i = index.get(c) as number;
      matrix[i][i] = rows.filter((r) => r.category === c).length;
    }
    // Group by source signal and tally cross-category co-occurrence.
    const bySource = new Map<string, Risk[]>();
    for (const r of rows) {
      const list = bySource.get(r.source) ?? [];
      list.push(r);
      bySource.set(r.source, list);
    }
    const pairCount = new Map<string, number>();
    for (const list of bySource.values()) {
      const cats = [...new Set(list.map((r) => r.category))];
      for (let a = 0; a < cats.length; a += 1) {
        for (let b = a + 1; b < cats.length; b += 1) {
          const ia = index.get(cats[a]) as number;
          const ib = index.get(cats[b]) as number;
          matrix[ia][ib] += 1;
          matrix[ib][ia] += 1;
          const k = [cats[a], cats[b]].sort().join('::');
          pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
        }
      }
    }

    const pairs: CorrelationCell[] = [...pairCount.entries()]
      .map(([k, count]) => { const [a, b] = k.split('::'); return { a, b, count }; })
      .sort((x, y) => y.count - x.count);

    const sharedSourceGroups: SharedSourceGroup[] = [...bySource.entries()]
      .filter(([, list]) => list.length >= 2)
      .map(([source, list]) => ({
        source,
        riskIds: list.map((r) => r.id),
        titles: list.map((r) => r.title),
      }));

    // Name clusters from the strongest pair links (a cluster is the set of
    // categories transitively linked by a shared signal).
    const clusters = this.cluster(categories, pairs, rows);

    return {
      projectKey,
      categories,
      matrix,
      pairs,
      sharedSourceGroups,
      clusters,
      basis:
        'Diagonal = open-risk count per category. Off-diagonal = risks sharing the same source ' +
        'signal across two categories. Clusters connect categories linked by a shared signal.',
    };
  }

  /** Whole-estate risk roll-up grouped by portfolio + program (company-scoped). */
  async portfolio(): Promise<PortfolioRiskResult> {
    const projects = await this.projects.find({ where: { isCurrent: true, ...companyScope() } });
    // Risk has no companyId — scope it to the caller's (already-scoped) projects.
    const projectKeys = new Set(projects.map((p) => p.businessKey));
    const allRisks = (await this.risks.find({ where: { status: In(['open', 'mitigating']) } }))
      .filter((r) => projectKeys.has(r.projectBusinessKey));

    const byProjectKey = new Map<string, Risk[]>();
    for (const r of allRisks) {
      const list = byProjectKey.get(r.projectBusinessKey) ?? [];
      list.push(r);
      byProjectKey.set(r.projectBusinessKey, list);
    }

    const rows: PortfolioRiskProjectRow[] = [];
    const totals = { openRiskCount: 0, sumScore: 0, maxScore: 0 };
    const portfolioAgg = new Map<string, PortfolioRiskGroup & { projects: Set<string> }>();
    const programAgg = new Map<string, PortfolioRiskGroup & { projects: Set<string> }>();

    for (const p of projects) {
      const list = byProjectKey.get(p.businessKey) ?? [];
      const openRiskCount = list.length;
      const sumScore = round3(list.reduce((s, r) => s + r.priorityScore, 0));
      const maxScore = list.length > 0 ? round3(Math.max(...list.map((r) => r.priorityScore))) : 0;
      const topTier = list.length > 0
        ? list.slice().sort((a, b) => b.priorityScore - a.priorityScore)[0].tier
        : null;

      rows.push({
        projectKey: p.businessKey,
        name: p.name,
        programBusinessKey: p.programBusinessKey,
        portfolioBusinessKey: p.portfolioBusinessKey,
        openRiskCount, sumScore, maxScore, topTier,
      });

      totals.openRiskCount += openRiskCount;
      totals.sumScore = round3(totals.sumScore + sumScore);
      totals.maxScore = Math.max(totals.maxScore, maxScore);

      if (p.portfolioBusinessKey) {
        this.accumulate(portfolioAgg, 'portfolio', p.portfolioBusinessKey, p.businessKey, openRiskCount, sumScore, maxScore);
      }
      if (p.programBusinessKey) {
        this.accumulate(programAgg, 'program', p.programBusinessKey, p.businessKey, openRiskCount, sumScore, maxScore);
      }
    }

    rows.sort((a, b) => b.sumScore - a.sumScore);

    return {
      projectCount: rows.length,
      totals: { ...totals, sumScore: round3(totals.sumScore), maxScore: round3(totals.maxScore) },
      rows,
      byPortfolio: [...portfolioAgg.values()].map(strip).sort((a, b) => b.sumScore - a.sumScore),
      byProgram: [...programAgg.values()].map(strip).sort((a, b) => b.sumScore - a.sumScore),
      basis:
        'Per-project open-risk count, sum of priority scores, and max priority. Grouped roll-ups ' +
        'by Project.portfolioBusinessKey and Project.programBusinessKey when set.',
    };
  }

  private accumulate(
    agg: Map<string, PortfolioRiskGroup & { projects: Set<string> }>,
    groupBy: 'portfolio' | 'program',
    key: string,
    projectKey: string,
    openRiskCount: number,
    sumScore: number,
    maxScore: number,
  ): void {
    const cur = agg.get(key) ?? {
      groupBy, key, openRiskCount: 0, sumScore: 0, maxScore: 0, projectCount: 0, projects: new Set<string>(),
    };
    cur.openRiskCount += openRiskCount;
    cur.sumScore = round3(cur.sumScore + sumScore);
    cur.maxScore = Math.max(cur.maxScore, maxScore);
    cur.projects.add(projectKey);
    cur.projectCount = cur.projects.size;
    agg.set(key, cur);
  }

  private cluster(
    categories: string[],
    pairs: CorrelationCell[],
    rows: Risk[],
  ): Array<{ name: string; categories: string[]; riskCount: number }> {
    // Union-find over categories linked by any shared signal.
    const parent = new Map(categories.map((c) => [c, c]));
    const find = (x: string): string => {
      let r = x;
      while (parent.get(r) !== r) r = parent.get(r) as string;
      return r;
    };
    const union = (a: string, b: string) => { parent.set(find(a), find(b)); };
    for (const p of pairs) union(p.a, p.b);

    const groups = new Map<string, string[]>();
    for (const c of categories) {
      const root = find(c);
      const list = groups.get(root) ?? [];
      list.push(c);
      groups.set(root, list);
    }
    return [...groups.values()]
      .filter((cats) => cats.length >= 2)
      .map((cats) => ({
        name: `${cats.slice().sort().join(' + ')} cluster`,
        categories: cats.slice().sort(),
        riskCount: rows.filter((r) => cats.includes(r.category)).length,
      }))
      .sort((a, b) => b.riskCount - a.riskCount);
  }
}

function strip(g: PortfolioRiskGroup & { projects?: Set<string> }): PortfolioRiskGroup {
  const { projects: _projects, ...rest } = g;
  return rest;
}
const round3 = (n: number): number => Math.round(n * 1000) / 1000;
