import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { AlertSeverity, HierarchyLevel } from '../../common/enums';
import {
  Activity,
  Alert,
  CorrectiveAction,
  DecisionReview,
  GovernanceDecision,
  GovernanceStatusSnapshot,
  Project,
} from '../canonical/entities';

/** A ranked, possibly-derived recommendation for the command center. */
export interface RecommendedAction {
  id: string | null;
  nodeBusinessKey: string;
  title: string;
  rationale: string;
  sourceLayer: string;
  priority: string;
  /** True when generated on the fly from current state (no persistence). */
  derived: boolean;
  status: string | null;
  ageDays: number | null;
}

/** One open governance escalation that has not yet been approved. */
export interface EscalationPathRow {
  decisionId: string;
  alertCode: string;
  projectKey: string;
  escalationLevel: string;
  responsibleParty: string;
  ageDays: number;
  path: string[];
  currentStep: number;
  nextStep: string;
}

/** Executive value-at-risk + benefit-realization impact analysis. */
export interface ImpactAnalysis {
  degraded: Array<{ projectKey: string; name: string; bac: number; shareOfPortfolioBacPct: number }>;
  totals: {
    portfolioBac: number;
    valueAtRisk: number;
    valueAtRiskPct: number;
  };
  benefitRealization: {
    perProject: Array<{ projectKey: string; name: string; status: string | null; benefitPct: number }>;
    weightedTargetPct: number;
    weightedRealizedPct: number;
    benefitGapPct: number;
  };
}

const ESCALATION_LADDER = ['L1 Project', 'L2 Program/PMO', 'L3 Executive'];
const STATUS_BENEFIT_MULTIPLIER: Record<string, number> = { green: 1, yellow: 0.85, orange: 0.6, red: 0.4 };
const DEGRADED = new Set(['orange', 'red']);
const PRIORITY_RANK: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };

/**
 * CommandCenterService — the deterministic analytics behind the L8 Sigma
 * Governance command center's four new sections. Every number is computed by an
 * explicit formula from current canonical state (no LLM, no persistence for the
 * derived rows): recommended actions, escalation paths, executive value-at-risk
 * impact, and benefit-realization impact.
 */
@Injectable()
export class CommandCenterService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(CorrectiveAction) private readonly actions: Repository<CorrectiveAction>,
    @InjectRepository(GovernanceDecision) private readonly decisions: Repository<GovernanceDecision>,
    @InjectRepository(DecisionReview) private readonly reviews: Repository<DecisionReview>,
    @InjectRepository(GovernanceStatusSnapshot)
    private readonly snapshots: Repository<GovernanceStatusSnapshot>,
  ) {}

  // ───────────────────────── recommended actions ─────────────────────────

  /**
   * Open CorrectiveActions ranked by priority + age, PLUS derived
   * recommendations generated on the fly: every node whose latest status is
   * orange/red gets a "convene recovery review" row driven by its critical
   * alert count. Derived rows are not persisted.
   */
  async recommendedActions(): Promise<{ rows: RecommendedAction[] }> {
    const open = await this.actions.find({ where: { status: 'open' } });
    const persisted: RecommendedAction[] = open.map((a) => ({
      id: a.id,
      nodeBusinessKey: a.nodeBusinessKey,
      title: a.title,
      rationale: a.description,
      sourceLayer: a.sourceLayer,
      priority: a.priority,
      derived: false,
      status: a.status,
      ageDays: ageDays(a.createdAt),
    }));

    // Derived rows from current degraded status.
    const projects = await this.projects.find({ where: { isCurrent: true } });
    const derived: RecommendedAction[] = [];
    for (const p of projects) {
      const status = await this.latestStatus(HierarchyLevel.PROJECT, p.businessKey, p.governanceStatus ?? null);
      if (!DEGRADED.has(status ?? '')) continue;
      const criticalCount = await this.alerts.count({ where: { projectId: p.id, severity: AlertSeverity.CRITICAL } });
      const priority = status === 'red' ? 'critical' : 'high';
      derived.push({
        id: null,
        nodeBusinessKey: p.businessKey,
        title: `Convene recovery review for ${p.businessKey} — status ${status}`,
        rationale:
          `${p.name} is ${status}` +
          (criticalCount > 0
            ? ` driven by ${criticalCount} critical alert${criticalCount === 1 ? '' : 's'}.`
            : ' — degraded governance status with no approved recovery plan.') +
          ' Convene a recovery review and assign corrective owners.',
        sourceLayer: 'l8_sigma_governance',
        priority,
        derived: true,
        status: null,
        ageDays: null,
      });
    }

    const rows = [...persisted, ...derived].sort((a, b) => {
      const pr = (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0);
      if (pr !== 0) return pr;
      return (b.ageDays ?? 0) - (a.ageDays ?? 0);
    });
    return { rows };
  }

  // ───────────────────────── escalation paths ─────────────────────────

  /**
   * Open escalations: GovernanceDecision rows carrying an escalationLevel whose
   * underlying alert has no approving DecisionReview yet. Each row gets the
   * L1→L2→L3 path sliced to its level, the age in days, and the next step.
   */
  async escalationPaths(): Promise<{ rows: EscalationPathRow[] }> {
    const decisions = await this.decisions.find({ order: { createdAt: 'DESC' }, take: 500 });
    const escalated = decisions.filter((d) => !!d.escalationLevel);
    if (escalated.length === 0) return { rows: [] };

    // Which decisions are already approved? (approve action on their alert).
    const decisionIds = escalated.map((d) => d.id);
    const approving = await this.reviews.find({
      where: { decisionId: In(decisionIds), action: 'approve' },
    });
    const approvedDecisionIds = new Set(approving.map((r) => r.decisionId));

    // Resolve project businessKey + alert code per decision via the alert row.
    const alertIds = [...new Set(escalated.map((d) => d.alertId))];
    const alerts = alertIds.length
      ? await this.alerts.find({ where: { id: In(alertIds) } })
      : [];
    const alertById = new Map(alerts.map((a) => [a.id, a]));

    const projectIds = [...new Set(alerts.map((a) => a.projectId))];
    const projects = projectIds.length
      ? await this.projects.find({ where: { id: In(projectIds) } })
      : [];
    const projectKeyById = new Map(projects.map((p) => [p.id, p.businessKey]));

    const rows: EscalationPathRow[] = [];
    for (const d of escalated) {
      if (approvedDecisionIds.has(d.id)) continue;
      const alert = alertById.get(d.alertId);
      const level = clampLevel(parseLevel(d.escalationLevel));
      const path = ESCALATION_LADDER.slice(0, level);
      const currentStep = level; // 1-based: L1=>1 … L3=>3
      const nextStep =
        level >= 3
          ? 'Escalate to executive sponsor for a recovery decision.'
          : `Advance to ${ESCALATION_LADDER[level]} and secure an approving review.`;
      rows.push({
        decisionId: d.id,
        alertCode: alert?.code ?? 'UNKNOWN',
        projectKey: (alert && projectKeyById.get(alert.projectId)) ?? 'unknown',
        escalationLevel: d.escalationLevel,
        responsibleParty: d.responsibleParty,
        ageDays: ageDays(d.createdAt) ?? 0,
        path,
        currentStep,
        nextStep,
      });
    }

    rows.sort((a, b) => b.currentStep - a.currentStep || b.ageDays - a.ageDays);
    return { rows };
  }

  // ───────────────────────── impact analysis ─────────────────────────

  /**
   * Executive impact: for each degraded (orange/red) project the BAC at risk +
   * its share of the portfolio, the total value-at-risk, and per-project
   * benefit-realization (EV/BAC × status multiplier) plus the portfolio benefit
   * gap (weighted progress target minus weighted realized).
   */
  async impactAnalysis(): Promise<ImpactAnalysis> {
    const projects = await this.projects.find({ where: { isCurrent: true } });

    // Compute EVM (bac/ev/pv) per project locally.
    const evm = await Promise.all(projects.map((p) => this.projectEvm(p)));
    const byKey = new Map(projects.map((p, i) => [p.businessKey, { project: p, evm: evm[i] }]));

    const portfolioBac = evm.reduce((s, e) => s + e.bac, 0);

    // Resolve each project's current status.
    const statuses = new Map<string, string | null>();
    for (const p of projects) {
      statuses.set(p.businessKey, await this.latestStatus(HierarchyLevel.PROJECT, p.businessKey, p.governanceStatus ?? null));
    }

    const degraded = projects
      .filter((p) => DEGRADED.has(statuses.get(p.businessKey) ?? ''))
      .map((p) => {
        const e = byKey.get(p.businessKey)!.evm;
        return {
          projectKey: p.businessKey,
          name: p.name,
          bac: round2(e.bac),
          shareOfPortfolioBacPct: portfolioBac > 0 ? round2((e.bac / portfolioBac) * 100) : 0,
        };
      })
      .sort((a, b) => b.bac - a.bac);

    const valueAtRisk = degraded.reduce((s, d) => s + d.bac, 0);

    // Benefit realization per project + portfolio gap.
    const perProject = projects.map((p) => {
      const e = byKey.get(p.businessKey)!.evm;
      const status = statuses.get(p.businessKey) ?? null;
      const mult = STATUS_BENEFIT_MULTIPLIER[status ?? ''] ?? 1;
      const benefitPct = e.bac > 0 ? Math.round(100 * (e.ev / e.bac) * mult) : 0;
      return { projectKey: p.businessKey, name: p.name, status, benefitPct };
    });

    // Weighted target = BAC-weighted progress % (EV/BAC); realized = benefitPct.
    let targetNum = 0;
    let realizedNum = 0;
    let den = 0;
    for (const p of projects) {
      const e = byKey.get(p.businessKey)!.evm;
      if (e.bac <= 0) continue;
      const target = (e.ev / e.bac) * 100;
      const realized = perProject.find((x) => x.projectKey === p.businessKey)!.benefitPct;
      targetNum += target * e.bac;
      realizedNum += realized * e.bac;
      den += e.bac;
    }
    const weightedTargetPct = den > 0 ? round2(targetNum / den) : 0;
    const weightedRealizedPct = den > 0 ? round2(realizedNum / den) : 0;

    return {
      degraded,
      totals: {
        portfolioBac: round2(portfolioBac),
        valueAtRisk: round2(valueAtRisk),
        valueAtRiskPct: portfolioBac > 0 ? round2((valueAtRisk / portfolioBac) * 100) : 0,
      },
      benefitRealization: {
        perProject,
        weightedTargetPct,
        weightedRealizedPct,
        benefitGapPct: round2(weightedTargetPct - weightedRealizedPct),
      },
    };
  }

  // ───────────────────────── helpers ─────────────────────────

  /** Local EVM (PMI EV/PV/AC) for one project from its canonical activities. */
  private async projectEvm(project: Project): Promise<{ bac: number; ev: number; pv: number; ac: number }> {
    const versions = await this.projects.find({
      where: { businessKey: project.businessKey },
      select: { id: true },
    });
    const projectIds = versions.map((v) => v.id);
    const acts = projectIds.length
      ? await this.activities.find({ where: { projectId: In(projectIds), isCurrent: true } })
      : [];
    let bac = 0, ev = 0, pv = 0, ac = 0;
    for (const a of acts) {
      const budget = num(a.budgetedCost);
      bac += budget;
      pv += budget * clamp01(a.plannedPctComplete);
      ev += budget * clamp01(a.actualPctComplete);
      ac += num(a.actualCost);
    }
    return { bac, ev, pv, ac };
  }

  /** Latest persisted snapshot status, falling back to the denormalized one. */
  private async latestStatus(nodeType: string, nodeBusinessKey: string, fallback: string | null): Promise<string | null> {
    const snap = await this.snapshots.findOne({
      where: { nodeType, nodeBusinessKey },
      order: { computedAt: 'DESC' },
    });
    return snap?.status ?? fallback;
  }
}

function parseLevel(level: string | null | undefined): number {
  const n = Number.parseInt((level ?? '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 1;
}
function clampLevel(n: number): number {
  return Math.max(1, Math.min(3, n));
}
function ageDays(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
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
