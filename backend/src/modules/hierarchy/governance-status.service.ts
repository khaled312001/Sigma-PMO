import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  GOVERNANCE_STATUS_RANK,
  GovernanceStatus,
  HierarchyLevel,
} from '../../common/enums';
import {
  Alert,
  ConfidenceScore,
  Enterprise,
  GovernanceDecision,
  GovernanceStatusSnapshot,
  Portfolio,
  Program,
  Project,
} from '../canonical/entities';

/** Inputs to the deterministic leaf-status rule (pure, fully testable). */
export interface LeafStatusInputs {
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  /** Highest open escalation level seen (1=L1 … 3=L3; 0 = none). */
  maxEscalation: number;
  /** Average data confidence [0,1] across the node's ingestion runs (1 = none). */
  confidenceAvg: number;
}

export interface StatusResult {
  status: GovernanceStatus;
  score: number;
  inputs: Record<string, unknown>;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * GovernanceStatusService — the brain of the 4-tier Green/Yellow/Orange/Red
 * governance status (Mr. Ayham's status categories). Two halves:
 *
 *  - `computeLeaf(...)` — PURE deterministic rule turning a project's open
 *    alerts + escalations + confidence into a tier + an explainable score.
 *    No I/O, so it is unit-tested in isolation (the plan's highest-risk item).
 *  - `recompute*` — load the inputs for a node, call `computeLeaf`/`rollUp`,
 *    and persist an append-only `GovernanceStatusSnapshot` + stamp the node's
 *    denormalized `governanceStatus`. Roll-up parents take worst-of-children.
 */
@Injectable()
export class GovernanceStatusService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Program) private readonly programs: Repository<Program>,
    @InjectRepository(Portfolio) private readonly portfolios: Repository<Portfolio>,
    @InjectRepository(Enterprise) private readonly enterprises: Repository<Enterprise>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(GovernanceDecision)
    private readonly decisions: Repository<GovernanceDecision>,
    @InjectRepository(ConfidenceScore)
    private readonly confidences: Repository<ConfidenceScore>,
    @InjectRepository(GovernanceStatusSnapshot)
    private readonly snapshots: Repository<GovernanceStatusSnapshot>,
  ) {}

  // ───────────────────────── pure rule (testable) ─────────────────────────

  /**
   * Deterministic leaf-status ladder. Explainable by construction: the score
   * is a weighted sum of the drivers and the tier comes from fixed thresholds,
   * with two hard overrides (an L3 escalation, or a flood of criticals, forces
   * RED regardless of the smoothed score).
   */
  computeLeaf(i: LeafStatusInputs): StatusResult {
    const warningTerm = clamp01(i.warningCount / 10) * 0.15;
    const criticalTerm = clamp01(i.criticalCount / 5) * 0.35;
    const escalationTerm = clamp01(i.maxEscalation / 3) * 0.3;
    const confidencePenalty = clamp01((0.7 - i.confidenceAvg) / 0.7) * 0.2;
    const score = clamp01(warningTerm + criticalTerm + escalationTerm + confidencePenalty);

    let status: GovernanceStatus;
    if (i.maxEscalation >= 3 || i.criticalCount >= 5) {
      status = GovernanceStatus.RED;
    } else if (score >= 0.75) {
      status = GovernanceStatus.RED;
    } else if (score >= 0.45 || i.criticalCount > 0) {
      status = GovernanceStatus.ORANGE;
    } else if (score >= 0.15 || i.warningCount > 0 || i.confidenceAvg < 0.6) {
      status = GovernanceStatus.YELLOW;
    } else {
      status = GovernanceStatus.GREEN;
    }

    return {
      status,
      score,
      inputs: {
        ...i,
        weights: { warning: 0.15, critical: 0.35, escalation: 0.3, confidence: 0.2 },
        terms: { warningTerm, criticalTerm, escalationTerm, confidencePenalty },
        rule: 'leaf-ladder-v1',
      },
    };
  }

  /** Worst-of-children roll-up for program/portfolio/enterprise nodes. */
  rollUp(childStatuses: GovernanceStatus[], childScores: number[]): StatusResult {
    if (childStatuses.length === 0) {
      return {
        status: GovernanceStatus.GREEN,
        score: 0,
        inputs: { childCount: 0, rule: 'rollup-worst-of-v1' },
      };
    }
    let worst = GovernanceStatus.GREEN;
    for (const s of childStatuses) {
      if (GOVERNANCE_STATUS_RANK[s] > GOVERNANCE_STATUS_RANK[worst]) worst = s;
    }
    const tally: Record<string, number> = { green: 0, yellow: 0, orange: 0, red: 0 };
    for (const s of childStatuses) tally[s] = (tally[s] ?? 0) + 1;
    return {
      status: worst,
      score: childScores.length ? Math.max(...childScores) : 0,
      inputs: { childCount: childStatuses.length, tally, rule: 'rollup-worst-of-v1' },
    };
  }

  // ───────────────────────── persistence path ─────────────────────────

  /** Recompute + persist a single project's status. Returns the new status. */
  async recomputeProject(projectKey: string): Promise<StatusResult> {
    const project = await this.projects.findOne({
      where: { businessKey: projectKey, isCurrent: true },
    });
    if (!project) {
      const empty = this.computeLeaf({
        criticalCount: 0, warningCount: 0, infoCount: 0, maxEscalation: 0, confidenceAvg: 1,
      });
      return empty;
    }

    const alertRows = await this.alerts.find({ where: { projectId: project.id } });
    let criticalCount = 0, warningCount = 0, infoCount = 0;
    for (const a of alertRows) {
      if (a.severity === 'critical') criticalCount += 1;
      else if (a.severity === 'warning') warningCount += 1;
      else infoCount += 1;
    }

    let maxEscalation = 0;
    if (alertRows.length > 0) {
      const decisionRows = await this.decisions.find({
        where: { alertId: In(alertRows.map((a) => a.id)) },
      });
      for (const d of decisionRows) {
        const lvl = Number.parseInt((d.escalationLevel ?? '').replace(/[^0-9]/g, ''), 10);
        if (Number.isFinite(lvl) && lvl > maxEscalation) maxEscalation = lvl;
      }
    }

    const confRows = await this.confidences.find({
      where: { ingestionRunId: project.ingestionRunId },
    });
    const confidenceAvg = confRows.length
      ? confRows.reduce((s, c) => s + c.overall, 0) / confRows.length
      : 1;

    const result = this.computeLeaf({
      criticalCount, warningCount, infoCount, maxEscalation, confidenceAvg,
    });

    await this.persistSnapshot(HierarchyLevel.PROJECT, projectKey, result);
    project.governanceStatus = result.status;
    await this.projects.save(project);
    return result;
  }

  /** Recompute a program from its child projects (worst-of). */
  async recomputeProgram(programKey: string): Promise<StatusResult> {
    const children = await this.projects.find({
      where: { programBusinessKey: programKey, isCurrent: true },
    });
    const results = await Promise.all(
      children.map((c) => this.recomputeProject(c.businessKey)),
    );
    const result = this.rollUp(results.map((r) => r.status), results.map((r) => r.score));
    await this.persistSnapshot(HierarchyLevel.PROGRAM, programKey, result);
    const program = await this.programs.findOne({
      where: { businessKey: programKey, isCurrent: true },
    });
    if (program) {
      program.governanceStatus = result.status;
      await this.programs.save(program);
    }
    return result;
  }

  /** Recompute a portfolio from its child programs (worst-of). */
  async recomputePortfolio(portfolioKey: string): Promise<StatusResult> {
    const children = await this.programs.find({
      where: { portfolioBusinessKey: portfolioKey, isCurrent: true },
    });
    const results = await Promise.all(
      children.map((c) => this.recomputeProgram(c.businessKey)),
    );
    const result = this.rollUp(results.map((r) => r.status), results.map((r) => r.score));
    await this.persistSnapshot(HierarchyLevel.PORTFOLIO, portfolioKey, result);
    const portfolio = await this.portfolios.findOne({
      where: { businessKey: portfolioKey, isCurrent: true },
    });
    if (portfolio) {
      portfolio.governanceStatus = result.status;
      await this.portfolios.save(portfolio);
    }
    return result;
  }

  /** Recompute an enterprise from its child portfolios (worst-of). */
  async recomputeEnterprise(enterpriseKey: string): Promise<StatusResult> {
    const children = await this.portfolios.find({
      where: { enterpriseBusinessKey: enterpriseKey, isCurrent: true },
    });
    const results = await Promise.all(
      children.map((c) => this.recomputePortfolio(c.businessKey)),
    );
    const result = this.rollUp(results.map((r) => r.status), results.map((r) => r.score));
    await this.persistSnapshot(HierarchyLevel.ENTERPRISE, enterpriseKey, result);
    const enterprise = await this.enterprises.findOne({
      where: { businessKey: enterpriseKey, isCurrent: true },
    });
    if (enterprise) {
      enterprise.governanceStatus = result.status;
      await this.enterprises.save(enterprise);
    }
    return result;
  }

  /** Latest persisted status for a node (or null if never computed). */
  latestFor(
    nodeType: HierarchyLevel | string,
    nodeBusinessKey: string,
  ): Promise<GovernanceStatusSnapshot | null> {
    return this.snapshots.findOne({
      where: { nodeType, nodeBusinessKey },
      order: { computedAt: 'DESC' },
    });
  }

  private async persistSnapshot(
    nodeType: HierarchyLevel,
    nodeBusinessKey: string,
    result: StatusResult,
  ): Promise<void> {
    await this.snapshots.save(
      this.snapshots.create({
        nodeType,
        nodeBusinessKey,
        status: result.status,
        score: result.score,
        inputs: result.inputs,
        computedAt: new Date(),
      }),
    );
  }
}
