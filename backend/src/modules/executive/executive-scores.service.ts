import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { HierarchyLevel } from '../../common/enums';
import {
  FeasibilityAssessment,
  FundingFacility,
  GovernanceStatusSnapshot,
  OpportunityScreening,
  Project,
} from '../canonical/entities';
import { clamp01, statusPoints } from './health-score';

/** One 0–100 governance score with its provenance and the rows behind it. */
export interface GovernanceScore {
  /** 0–100 (higher = healthier). */
  score: number;
  /** Plain-English formula. */
  basis: string;
  /** Sample size driving the score (rows averaged). */
  count: number;
  /** True when no rows existed and a documented fallback was used. */
  fallback: boolean;
}

/** GET /executive/scores — the executive governance score-card (6 scores). */
export interface ExecutiveScores {
  asOfDate: string;
  /** Mean of the six scores below — one number for the very top of the page. */
  compositeScore: number;
  enterpriseGovernanceScore: GovernanceScore;
  investmentGovernanceScore: GovernanceScore;
  portfolioGovernanceScore: GovernanceScore;
  opportunityPipelineScore: GovernanceScore;
  bankabilityScore: GovernanceScore;
  fundingHealthScore: GovernanceScore;
}

/**
 * ExecutiveScoresService — the enterprise-level governance score-card: six
 * deterministic 0–100 scores spanning the full investment lifecycle
 * (enterprise governance, investment governance, portfolio, opportunity
 * pipeline, bankability, funding health).
 *
 * Deterministic-first: every score is a named formula over current canonical
 * rows, each carries its own basis + sample count, and nothing is read from the
 * system clock — the service takes an `asOfDate` so the same rows always
 * produce the same score-card.
 */
@Injectable()
export class ExecutiveScoresService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(GovernanceStatusSnapshot)
    private readonly statusSnapshots: Repository<GovernanceStatusSnapshot>,
    @InjectRepository(FeasibilityAssessment)
    private readonly feasibility: Repository<FeasibilityAssessment>,
    @InjectRepository(OpportunityScreening)
    private readonly opportunities: Repository<OpportunityScreening>,
    @InjectRepository(FundingFacility)
    private readonly facilities: Repository<FundingFacility>,
  ) {}

  async compute(asOfDate = '2026-06-12'): Promise<ExecutiveScores> {
    const [
      enterpriseGovernanceScore,
      investmentGovernanceScore,
      portfolioGovernanceScore,
      opportunityPipelineScore,
      bankabilityScore,
      fundingHealthScore,
    ] = await Promise.all([
      this.enterpriseGovernance(),
      this.investmentGovernance(),
      this.portfolioGovernance(),
      this.opportunityPipeline(),
      this.bankability(),
      this.fundingHealth(),
    ]);

    const all = [
      enterpriseGovernanceScore,
      investmentGovernanceScore,
      portfolioGovernanceScore,
      opportunityPipelineScore,
      bankabilityScore,
      fundingHealthScore,
    ];
    const compositeScore = Math.round(
      all.reduce((sum, s) => sum + s.score, 0) / all.length,
    );

    return {
      asOfDate,
      compositeScore,
      enterpriseGovernanceScore,
      investmentGovernanceScore,
      portfolioGovernanceScore,
      opportunityPipelineScore,
      bankabilityScore,
      fundingHealthScore,
    };
  }

  // ───────────────────────── the six scores ─────────────────────────

  /**
   * enterpriseGovernanceScore — mean latest governance snapshot across the
   * enterprise + portfolio roll-up nodes, mapped 100·(1−score) (snapshot score
   * is [0,1], 0=healthy). Falls back to project nodes when no roll-up exists.
   */
  private async enterpriseGovernance(): Promise<GovernanceScore> {
    const rollup = await this.latestSnapshotScores([
      HierarchyLevel.ENTERPRISE,
      HierarchyLevel.PORTFOLIO,
    ]);
    const usedFallback = rollup.length === 0;
    const source = usedFallback
      ? await this.latestSnapshotScores([HierarchyLevel.PROJECT])
      : rollup;

    if (source.length === 0) {
      return {
        score: 50,
        basis:
          'No GovernanceStatusSnapshot rows for enterprise/portfolio or project nodes — neutral 50 fallback.',
        count: 0,
        fallback: true,
      };
    }
    const meanScore = mean(source);
    return {
      score: Math.round(100 * clamp01(1 - meanScore)),
      basis:
        `mean of the latest GovernanceStatusSnapshot.score per ${usedFallback ? 'project' : 'enterprise+portfolio'} ` +
        'node, mapped 100·(1−score) (score [0,1], 0=healthy)' +
        (usedFallback ? '; fell back to project nodes (no roll-up snapshot found).' : '.'),
      count: source.length,
      fallback: usedFallback,
    };
  }

  /**
   * investmentGovernanceScore — average of the LATEST FeasibilityAssessment per
   * opportunity, scoring its recommendation: proceed=100, conditions=66,
   * hold=33, reject=0.
   */
  private async investmentGovernance(): Promise<GovernanceScore> {
    const latest = await this.latestFeasibilityPerOpportunity();
    if (latest.length === 0) {
      return {
        score: 50,
        basis: 'No FeasibilityAssessment rows — neutral 50 fallback.',
        count: 0,
        fallback: true,
      };
    }
    const pts = latest.map((f) => feasibilityRecPoints(f.recommendation));
    return {
      score: Math.round(mean(pts)),
      basis:
        'avg over the latest FeasibilityAssessment per opportunity of recommendation points: ' +
        'proceed=100, proceed_with_conditions=66, hold=33, reject=0.',
      count: latest.length,
      fallback: false,
    };
  }

  /**
   * portfolioGovernanceScore — mean of the latest project-node status mapped to
   * the shared 4-tier band points (green=100…red=0, missing=50).
   */
  private async portfolioGovernance(): Promise<GovernanceScore> {
    const projects = await this.projects.find({ where: { isCurrent: true } });
    if (projects.length === 0) {
      return {
        score: 50,
        basis: 'No current projects — neutral 50 fallback.',
        count: 0,
        fallback: true,
      };
    }
    const statuses = await Promise.all(
      projects.map((p) => this.latestProjectStatus(p.businessKey)),
    );
    const pts = statuses.map((s) => statusPoints(s) * 100);
    return {
      score: Math.round(mean(pts)),
      basis:
        'mean over current projects of the latest project-node governance status as band points ' +
        '(green=100, yellow=66, orange=33, red=0, missing=50).',
      count: projects.length,
      fallback: false,
    };
  }

  /**
   * opportunityPipelineScore — average of OpportunityScreening recommendations:
   * proceed=100, watchlist=50, reject=0. 0 when there are no screenings.
   */
  private async opportunityPipeline(): Promise<GovernanceScore> {
    const screenings = await this.opportunities.find();
    if (screenings.length === 0) {
      return {
        score: 0,
        basis: 'No OpportunityScreening rows — pipeline score is 0 (empty pipeline).',
        count: 0,
        fallback: true,
      };
    }
    const pts = screenings.map((s) => opportunityRecPoints(s.recommendation));
    return {
      score: Math.round(mean(pts)),
      basis:
        'avg over all OpportunityScreening rows of recommendation points: ' +
        'proceed_to_feasibility=100, watchlist=50, reject=0.',
      count: screenings.length,
      fallback: false,
    };
  }

  /**
   * bankabilityScore — the latest FeasibilityAssessment's
   * `results.attractivenessScore` (0–100); when absent, an NPV-positive
   * heuristic (NPV>0 → 75, else 25).
   */
  private async bankability(): Promise<GovernanceScore> {
    const latest = (await this.feasibility.find({ order: { createdAt: 'DESC' }, take: 1 }))[0] ?? null;
    if (!latest) {
      return {
        score: 50,
        basis: 'No FeasibilityAssessment rows — neutral 50 fallback.',
        count: 0,
        fallback: true,
      };
    }
    const results = (latest.results ?? {}) as Record<string, unknown>;
    const attractiveness = toNumber(results.attractivenessScore);
    if (attractiveness !== null) {
      return {
        score: Math.round(clampScore(attractiveness)),
        basis: 'latest FeasibilityAssessment.results.attractivenessScore (0–100).',
        count: 1,
        fallback: false,
      };
    }
    // Heuristic: a positive NPV is bankable-ish; a non-positive NPV is not.
    const npv = toNumber(results.npv);
    const score = npv !== null && npv > 0 ? 75 : 25;
    return {
      score,
      basis:
        'latest FeasibilityAssessment had no attractivenessScore — NPV-positive heuristic: ' +
        'NPV>0 → 75, otherwise 25.',
      count: 1,
      fallback: true,
    };
  }

  /**
   * fundingHealthScore — average DSCR headroom of current facilities vs. their
   * covenant. headroom = clamp((currentDscr − covenant)/0.5 · 0.5 + 0.5, 0, 1)
   * → ×100, so meeting the covenant exactly scores 50 and ≥covenant+0.5 scores
   * 100. Facilities with no covenant/DSCR are skipped. 50 when none usable.
   */
  private async fundingHealth(): Promise<GovernanceScore> {
    const facilities = await this.facilities.find({ where: { isCurrent: true } });
    const usable = facilities.filter(
      (f) =>
        f.currentDscr !== null &&
        f.currentDscr !== undefined &&
        Number.isFinite(f.currentDscr) &&
        f.dscrCovenant !== null &&
        f.dscrCovenant !== undefined &&
        Number.isFinite(f.dscrCovenant),
    );
    if (usable.length === 0) {
      return {
        score: 50,
        basis:
          'No current FundingFacility with both currentDscr and dscrCovenant — neutral 50 fallback.',
        count: 0,
        fallback: true,
      };
    }
    const pts = usable.map((f) => dscrHeadroomPoints(f.currentDscr!, f.dscrCovenant!) * 100);
    return {
      score: Math.round(mean(pts)),
      basis:
        'avg DSCR headroom over current facilities: headroom=clamp(0.5+(currentDscr−covenant)/0.5·0.5,0,1)·100 ' +
        '(meeting covenant exactly = 50; covenant+0.5 or better = 100).',
      count: usable.length,
      fallback: false,
    };
  }

  // ───────────────────────── deterministic helpers ─────────────────────────

  /** Latest snapshot score [0,1] per node, for the given node types. */
  private async latestSnapshotScores(types: HierarchyLevel[]): Promise<number[]> {
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

  /** Latest project-node governance tier for a project (null when none). */
  private async latestProjectStatus(projectKey: string): Promise<string | null> {
    const snap = await this.statusSnapshots.findOne({
      where: { nodeType: HierarchyLevel.PROJECT, nodeBusinessKey: projectKey },
      order: { computedAt: 'DESC' },
    });
    return snap?.status ? String(snap.status) : null;
  }

  /** The single most-recent FeasibilityAssessment per opportunityId. */
  private async latestFeasibilityPerOpportunity(): Promise<FeasibilityAssessment[]> {
    // Newest-first; the first row seen per opportunityId is its latest run.
    const rows = await this.feasibility.find({
      order: { createdAt: 'DESC' },
      take: 1000,
    });
    const latest = new Map<string, FeasibilityAssessment>();
    for (const r of rows) {
      if (!latest.has(r.opportunityId)) latest.set(r.opportunityId, r);
    }
    return [...latest.values()];
  }
}

// ── pure scoring functions (unit-testable, no I/O) ──────────────────────────

/** Feasibility recommendation → 0–100. Tolerant of label variants. */
function feasibilityRecPoints(rec: string | null | undefined): number {
  switch ((rec ?? '').toLowerCase()) {
    case 'proceed':
      return 100;
    case 'proceed_with_conditions':
    case 'proceed-with-conditions':
    case 'conditions':
      return 66;
    case 'hold':
      return 33;
    case 'reject':
      return 0;
    default:
      return 33; // unknown → treat as cautious "hold"
  }
}

/** Opportunity recommendation → 0–100. Tolerant of label variants. */
function opportunityRecPoints(rec: string | null | undefined): number {
  switch ((rec ?? '').toLowerCase()) {
    case 'proceed_to_feasibility':
    case 'proceed-to-feasibility':
    case 'proceed':
      return 100;
    case 'watchlist':
    case 'watch':
      return 50;
    case 'reject':
      return 0;
    default:
      return 50; // unknown → neutral watchlist
  }
}

/**
 * DSCR headroom → [0,1]. At covenant exactly = 0.5; each +0.5 of DSCR above the
 * covenant adds 0.5 (so covenant+0.5 → 1.0); below covenant falls symmetrically
 * to 0 at covenant−0.5.
 */
function dscrHeadroomPoints(currentDscr: number, covenant: number): number {
  return clamp01(0.5 + ((currentDscr - covenant) / 0.5) * 0.5);
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number.parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

const clampScore = (n: number): number => Math.max(0, Math.min(100, n));
