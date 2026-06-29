import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Activity, Project } from '../canonical/entities';

/**
 * CpmService — a standalone Critical Path Method solver over the persisted
 * `Activity.predecessors[]` logic network (Mr. Ayham acceptance 2026-06-28).
 *
 * It topologically sorts the activities via their FS/SS/FF/SF relationships,
 * runs a forward pass (ES/EF from durations + relationship lags) and a
 * backward pass (LS/LF from the project finish), and DERIVES total float +
 * criticality from the logic network — not from float-to-completion on the
 * raw dates. This is the same forward/backward math proven in
 * `baseline-template.service.ts` (the synthesised-baseline float pass),
 * generalised to read real `predecessors[]` instead of synthesised handoffs.
 *
 * Units are integer DAYS relative to the project start (day 0). Durations are
 * taken from `plannedDurationDays`, falling back to `(plannedFinish −
 * plannedStart)` when absent. Activities with no logic links and no dates
 * still appear in the result with float 0 (they cannot be sequenced, so they
 * are reported critical-by-default and the caller's fallback heuristic takes
 * over — `solve()` exposes `hasLogic` so callers know whether the network was
 * usable).
 */
@Injectable()
export class CpmService {
  private readonly logger = new Logger(CpmService.name);

  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
  ) {}

  /** Load the current activities for a project and solve the network. */
  async solve(projectKey: string): Promise<CpmResult> {
    const project = await this.projects.findOne({
      where: { businessKey: projectKey, isCurrent: true },
    });
    if (!project) throw new NotFoundException(`No current project "${projectKey}"`);
    const rows = await this.activities.find({
      where: { projectId: project.id, isCurrent: true },
    });
    return this.compute(projectKey, rows);
  }

  /**
   * Re-run the pass after applying `delayDays` to `affectedActivityKeys`
   * (true delay-impact / TIA). Returns the project slip vs the un-delayed
   * pass and whether the critical path membership changed.
   */
  async impact(
    projectKey: string,
    affectedActivityKeys: string[],
    delayDays: number,
  ): Promise<CpmImpactResult> {
    const project = await this.projects.findOne({
      where: { businessKey: projectKey, isCurrent: true },
    });
    if (!project) throw new NotFoundException(`No current project "${projectKey}"`);
    const rows = await this.activities.find({
      where: { projectId: project.id, isCurrent: true },
    });
    return this.computeImpact(projectKey, rows, affectedActivityKeys, delayDays);
  }

  // ───────────────────────── pure computation ─────────────────────────

  /**
   * Pure CPM solve over a set of activity rows. Exposed for unit testing.
   *
   * `opts.durationDeltaByKey` adds a per-activity duration delta (positive =
   * delay/impact, negative = crash). `opts.relOverrideByKey` overrides a
   * successor activity's predecessor relationship TYPE (used by recovery
   * fast-tracking, e.g. FS→SS overlap). The second positional `Map` form is
   * kept for the existing delay-impact callers.
   */
  compute(
    projectKey: string,
    rows: ActivityLike[],
    opts?: Map<string, number> | CpmComputeOptions,
  ): CpmResult {
    const options: CpmComputeOptions =
      opts instanceof Map ? { durationDeltaByKey: opts } : opts ?? {};
    const nodes = this.buildNodes(rows, options.durationDeltaByKey, options.relOverrideByKey);
    const hasLogic = [...nodes.values()].some((n) => n.preds.length > 0);

    if (nodes.size === 0) {
      return {
        projectKey,
        hasLogic: false,
        projectDurationDays: 0,
        activities: [],
        criticalPath: [],
      };
    }

    const order = this.topoSort(nodes);

    // Forward pass — ES/EF in day indices (day 0 = project start).
    for (const key of order) {
      const n = nodes.get(key)!;
      let es = 0;
      for (const p of n.preds) {
        const pred = nodes.get(p.activityKey);
        if (!pred) continue;
        const lag = p.lagDays;
        let candidate: number;
        switch (p.type) {
          case 'SS':
            candidate = pred.es + lag;
            break;
          case 'FF':
            candidate = pred.ef + lag - n.duration;
            break;
          case 'SF':
            candidate = pred.es + lag - n.duration;
            break;
          case 'FS':
          default:
            candidate = pred.ef + lag;
            break;
        }
        if (candidate > es) es = candidate;
      }
      n.es = Math.max(0, es);
      n.ef = n.es + n.duration;
    }

    const projectDurationDays = Math.max(...[...nodes.values()].map((n) => n.ef));

    // Backward pass — LF/LS from the project finish, honouring successor links.
    for (const key of [...order].reverse()) {
      const n = nodes.get(key)!;
      let lf = projectDurationDays;
      let hasSucc = false;
      for (const succKey of n.succs) {
        const succ = nodes.get(succKey);
        if (!succ) continue;
        hasSucc = true;
        const link = succ.preds.find((p) => p.activityKey === key)!;
        const lag = link.lagDays;
        let candidate: number;
        switch (link.type) {
          case 'SS':
            // succ.LS ≥ this.LS + lag  ⇒  this.LF ≤ succ.LS − lag + duration
            candidate = succ.ls - lag + n.duration;
            break;
          case 'FF':
            candidate = succ.lf - lag;
            break;
          case 'SF':
            // succ.LF ≥ this.LS + lag  ⇒  this.LF ≤ succ.LF − lag + duration
            candidate = succ.lf - lag + n.duration;
            break;
          case 'FS':
          default:
            candidate = succ.ls - lag;
            break;
        }
        if (candidate < lf) lf = candidate;
      }
      if (!hasSucc) lf = projectDurationDays;
      n.lf = lf;
      n.ls = n.lf - n.duration;
    }

    const baseStart = minDate(rows.map((r) => r.plannedStart ?? null));
    const activities: CpmActivity[] = order.map((key) => {
      const n = nodes.get(key)!;
      const totalFloat = n.ls - n.es;
      return {
        businessKey: key,
        name: n.name,
        durationDays: n.duration,
        es: n.es,
        ef: n.ef,
        ls: n.ls,
        lf: n.lf,
        totalFloat,
        isCritical: totalFloat <= 0,
        earlyStartIso: shiftIso(baseStart, n.es),
        earlyFinishIso: shiftIso(baseStart, n.ef),
      };
    });

    const criticalPath = activities.filter((a) => a.isCritical).map((a) => a.businessKey);

    this.logger.log(
      `CPM ${projectKey}: ${activities.length} activities, duration ${projectDurationDays}d, ` +
        `${criticalPath.length} critical (logic=${hasLogic}).`,
    );

    return { projectKey, hasLogic, projectDurationDays, activities, criticalPath };
  }

  /** Pure delay-impact: solve baseline, then re-solve with `delayDays` added. */
  computeImpact(
    projectKey: string,
    rows: ActivityLike[],
    affectedActivityKeys: string[],
    delayDays: number,
  ): CpmImpactResult {
    const before = this.compute(projectKey, rows);
    const extra = new Map<string, number>();
    for (const k of affectedActivityKeys) extra.set(k, Math.max(0, Math.round(delayDays)));
    const after = this.compute(projectKey, rows, extra);

    const projectSlipDays = after.projectDurationDays - before.projectDurationDays;
    const beforeSet = new Set(before.criticalPath);
    const afterSet = new Set(after.criticalPath);
    const criticalPathChanged =
      beforeSet.size !== afterSet.size ||
      [...afterSet].some((k) => !beforeSet.has(k)) ||
      [...beforeSet].some((k) => !afterSet.has(k));

    return {
      projectKey,
      hasLogic: before.hasLogic,
      delayDays: Math.max(0, Math.round(delayDays)),
      affectedActivityKeys,
      baselineDurationDays: before.projectDurationDays,
      projectedDurationDays: after.projectDurationDays,
      projectSlipDays,
      criticalPathChanged,
      before,
      after,
    };
  }

  // ───────────────────────── internals ─────────────────────────

  private buildNodes(
    rows: ActivityLike[],
    extra?: Map<string, number>,
    relOverride?: Map<string, RelType>,
  ): Map<string, CpmNode> {
    const nodes = new Map<string, CpmNode>();
    for (const r of rows) {
      const key = r.businessKey;
      if (!key) continue;
      const baseDuration = durationOf(r);
      // `extra` carries per-activity duration deltas (positive = delay/impact,
      // negative = crash). Clamp the resulting duration at 0.
      const duration = Math.max(0, baseDuration + (extra?.get(key) ?? 0));
      nodes.set(key, {
        key,
        name: r.name ?? key,
        duration,
        preds: (r.predecessors ?? []).map((p) => ({
          activityKey: p.activityKey,
          // A relationship override is keyed by the SUCCESSOR activity (this row).
          type: relOverride?.get(key) ?? normalizeType(p.type),
          lagDays: Number.isFinite(p.lagDays) ? Math.round(p.lagDays) : 0,
        })),
        succs: [],
        es: 0,
        ef: 0,
        ls: 0,
        lf: 0,
      });
    }
    // Wire successor lists, dropping links to unknown predecessors.
    for (const n of nodes.values()) {
      n.preds = n.preds.filter((p) => nodes.has(p.activityKey));
      for (const p of n.preds) {
        nodes.get(p.activityKey)!.succs.push(n.key);
      }
    }
    return nodes;
  }

  /** Kahn topological sort; cycles are broken by appending leftover nodes. */
  private topoSort(nodes: Map<string, CpmNode>): string[] {
    const indeg = new Map<string, number>();
    for (const n of nodes.values()) indeg.set(n.key, n.preds.length);
    const queue: string[] = [...nodes.values()].filter((n) => (indeg.get(n.key) ?? 0) === 0).map((n) => n.key);
    const order: string[] = [];
    const seen = new Set<string>();
    while (queue.length) {
      const key = queue.shift()!;
      if (seen.has(key)) continue;
      seen.add(key);
      order.push(key);
      for (const succ of nodes.get(key)!.succs) {
        indeg.set(succ, (indeg.get(succ) ?? 1) - 1);
        if ((indeg.get(succ) ?? 0) <= 0) queue.push(succ);
      }
    }
    // Any node not reached (cycle) — append deterministically so the pass still runs.
    for (const key of nodes.keys()) if (!seen.has(key)) order.push(key);
    return order;
  }
}

// ───────────────────────── types ─────────────────────────

export type RelType = 'FS' | 'SS' | 'FF' | 'SF';

/** Options for a CPM re-pass (duration deltas + relationship overrides). */
export interface CpmComputeOptions {
  /** Per-activity duration delta in days (positive = delay, negative = crash). */
  durationDeltaByKey?: Map<string, number>;
  /** Override a successor activity's predecessor relationship type (fast-track). */
  relOverrideByKey?: Map<string, RelType>;
}

/** Minimal activity shape the solver reads (subset of canonical Activity). */
export interface ActivityLike {
  businessKey: string;
  name?: string | null;
  plannedStart?: string | null;
  plannedFinish?: string | null;
  plannedDurationDays?: number | null;
  /** Decimal string (as persisted) — used by recovery crash-costing. */
  budgetedCost?: string | null;
  predecessors?: Array<{ activityKey: string; type: string; lagDays: number }> | null;
}

export interface CpmActivity {
  businessKey: string;
  name: string;
  durationDays: number;
  es: number;
  ef: number;
  ls: number;
  lf: number;
  totalFloat: number;
  isCritical: boolean;
  earlyStartIso: string | null;
  earlyFinishIso: string | null;
}

export interface CpmResult {
  projectKey: string;
  /** True when at least one activity carries a predecessor link. */
  hasLogic: boolean;
  projectDurationDays: number;
  activities: CpmActivity[];
  criticalPath: string[];
}

export interface CpmImpactResult {
  projectKey: string;
  hasLogic: boolean;
  delayDays: number;
  affectedActivityKeys: string[];
  baselineDurationDays: number;
  projectedDurationDays: number;
  projectSlipDays: number;
  criticalPathChanged: boolean;
  before: CpmResult;
  after: CpmResult;
}

interface CpmNode {
  key: string;
  name: string;
  duration: number;
  preds: Array<{ activityKey: string; type: RelType; lagDays: number }>;
  succs: string[];
  es: number;
  ef: number;
  ls: number;
  lf: number;
}

// ───────────────────────── helpers ─────────────────────────

function durationOf(r: ActivityLike): number {
  if (r.plannedDurationDays != null && Number.isFinite(r.plannedDurationDays)) {
    return Math.max(0, Math.round(r.plannedDurationDays));
  }
  if (r.plannedStart && r.plannedFinish) {
    const a = new Date(`${r.plannedStart.slice(0, 10)}T00:00:00Z`).getTime();
    const b = new Date(`${r.plannedFinish.slice(0, 10)}T00:00:00Z`).getTime();
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return Math.max(0, Math.round((b - a) / 86_400_000));
    }
  }
  return 0;
}

function normalizeType(t: string): RelType {
  const up = (t ?? '').toUpperCase();
  return up === 'SS' || up === 'FF' || up === 'SF' ? up : 'FS';
}

function minDate(dates: Array<string | null>): string | null {
  let m: string | null = null;
  for (const d of dates) {
    if (!d) continue;
    const iso = d.slice(0, 10);
    if (m === null || iso < m) m = iso;
  }
  return m;
}

function shiftIso(baseIso: string | null, days: number): string | null {
  if (!baseIso) return null;
  const d = new Date(`${baseIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
