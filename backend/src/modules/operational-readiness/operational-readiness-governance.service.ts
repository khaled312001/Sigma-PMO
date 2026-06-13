import { Injectable, Logger } from '@nestjs/common';

import { OperationalReadinessItem } from '../canonical/entities/operational-readiness-item.entity';
import { OperationalReadinessService } from './operational-readiness.service';

/** A single operational-readiness finding (NOT persisted — computed on demand). */
export interface ReadinessFinding {
  type:
    | 'overdue-item'
    | 'incomplete-item'
    | 'not-started'
    | 'category-gap'
    | 'go-live-blocker';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation: string;
  /** References tying the finding back to its item + computed quantum. */
  refs: Record<string, unknown>;
}

/** The composite operational-readiness result. */
export interface ReadinessScoreResult {
  projectKey: string;
  asOfDate: string;
  /** 0..100 composite readiness score. */
  score: number;
  status: 'green' | 'yellow' | 'orange' | 'red';
  /** Sub-scores from the relevant categories (0..100). */
  subScores: {
    goLiveReadiness: number;
    handoverReadiness: number;
    commissioningReadiness: number;
  };
  items: number;
  totals: {
    complete: number;
    inProgress: number;
    notStarted: number;
    overdue: number;
    avgCompletionPct: number | null;
  };
  narrative: string;
}

/** Per-status weight for the readiness score (status-progress mapped onto 0..1). */
const STATUS_WEIGHT: Record<string, number> = {
  not_started: 0,
  in_progress: 0.4,
  submitted: 0.7,
  approved: 0.9,
  complete: 1,
};

/** Category → sub-score grouping (Mr. Ayham, 2026-06-13 readiness model). */
const GO_LIVE_CATEGORIES = ['handover', 'staffing'];
const HANDOVER_CATEGORIES = ['handover', 'om_manual', 'asset_register'];
const COMMISSIONING_CATEGORIES = ['testing_commissioning'];

/**
 * OperationalReadinessGovernanceService — the deterministic operational
 * readiness engine (Mr. Ayham, 2026-06-13: construction-complete → operational
 * go-live). It reads a project's readiness items and derives, from explicit
 * named formulas, the readiness signals — overdue items, incomplete/not-started
 * items, category gaps and go-live blockers — plus a 0..100 readiness score and
 * three sub-scores (go-live / handover / commissioning readiness). Pure
 * deterministic (every number from a named formula); the AI layer only narrates
 * these later. Findings are NOT persisted — they are computed on demand from
 * the item state.
 */
@Injectable()
export class OperationalReadinessGovernanceService {
  private readonly logger = new Logger(OperationalReadinessGovernanceService.name);

  /** An item is "go-live critical" once its due date is within this window. */
  private static readonly GO_LIVE_WINDOW_DAYS = 30;

  constructor(private readonly readiness: OperationalReadinessService) {}

  /**
   * Validate the readiness position and return findings (not persisted). One
   * pass over every current item raising the deterministic signals. Pure —
   * `asOfDate` is the only time input (defaults to the deterministic platform
   * date), so the result is reproducible.
   */
  async validate(projectKey: string, asOfDate = '2026-06-12'): Promise<{
    projectKey: string;
    asOfDate: string;
    findings: ReadinessFinding[];
    itemsChecked: number;
  }> {
    const items = await this.readiness.list(projectKey);
    const asOf = parseDate(asOfDate);
    const findings: ReadinessFinding[] = [];

    for (const it of items) {
      const label = `${it.businessKey} — ${it.title}`;
      const progress = progressOf(it);
      const done = it.status === 'complete';

      // 1) Overdue item: dueDate before as-of and not complete.
      if (it.dueDate && !done) {
        const due = parseDate(it.dueDate);
        const days = daysBetween(asOf, due); // negative when past due
        if (days < 0) {
          const overdueDays = Math.abs(days);
          const goLiveCritical = GO_LIVE_CATEGORIES.includes(it.category);
          findings.push({
            type: 'overdue-item',
            severity: goLiveCritical || overdueDays > 30 ? 'critical' : 'warning',
            title: `Overdue readiness item — ${label} (${overdueDays}d late)`,
            description:
              `Readiness item "${it.title}" (${categoryLabel(it.category)}) was due ${it.dueDate} ` +
              `(${overdueDays} day(s) before ${asOfDate}) and is still "${it.status}" at ${(progress * 100).toFixed(0)}% progress.`,
            recommendation:
              'Escalate to the commissioning/handover lead; re-baseline the due date against the go-live plan and ' +
              'resource the item now — overdue readiness items push the operational go-live date.',
            refs: { businessKey: it.businessKey, category: it.category, dueDate: it.dueDate, overdueDays, status: it.status },
          });
        } else if (days <= OperationalReadinessGovernanceService.GO_LIVE_WINDOW_DAYS && progress < 1 && GO_LIVE_CATEGORIES.includes(it.category)) {
          // 5) Go-live blocker: go-live-critical category, inside the window, not complete.
          findings.push({
            type: 'go-live-blocker',
            severity: 'warning',
            title: `Go-live blocker — ${label} due in ${days}d`,
            description:
              `Go-live-critical item "${it.title}" (${categoryLabel(it.category)}) is due ${it.dueDate} ` +
              `(${days} day(s) from ${asOfDate}) but only ${(progress * 100).toFixed(0)}% ready. It gates the operational go-live.`,
            recommendation:
              'Confirm the item can complete inside the go-live window; if at risk, add a contingency plan or a ' +
              'phased go-live so handover/staffing readiness does not slip the operational date.',
            refs: { businessKey: it.businessKey, category: it.category, dueDate: it.dueDate, daysToDue: days, progress: round4(progress) },
          });
        }
      }

      // 2) Not started: zero progress (informational unless it carries a due date handled above).
      if (it.status === 'not_started') {
        findings.push({
          type: 'not-started',
          severity: 'info',
          title: `Not started — ${label}`,
          description:
            `Readiness item "${it.title}" (${categoryLabel(it.category)}) has not been started. ` +
            `It contributes 0% to operational readiness until mobilised.`,
          recommendation:
            'Sequence this item into the readiness plan with an owner and a due date ahead of the target go-live.',
          refs: { businessKey: it.businessKey, category: it.category, status: it.status },
        });
      } else if (!done) {
        // 3) Incomplete item: in flight but not yet complete.
        findings.push({
          type: 'incomplete-item',
          severity: progress < 0.5 ? 'warning' : 'info',
          title: `Incomplete (${(progress * 100).toFixed(0)}%) — ${label}`,
          description:
            `Readiness item "${it.title}" (${categoryLabel(it.category)}) is "${it.status}" at ` +
            `${(progress * 100).toFixed(0)}% readiness; it is not yet complete.`,
          recommendation:
            'Drive the item to "approved"/"complete": close the remaining checklist evidence and obtain sign-off ' +
            'from the operator/handover authority.',
          refs: { businessKey: it.businessKey, category: it.category, status: it.status, progress: round4(progress) },
        });
      }
    }

    // 4) Category gaps: a readiness category with no item at all.
    const present = new Set(items.map((it) => it.category));
    for (const cat of HANDOVER_CATEGORIES.concat(GO_LIVE_CATEGORIES, COMMISSIONING_CATEGORIES)) {
      if (!present.has(cat) && items.length > 0) {
        findings.push({
          type: 'category-gap',
          severity: GO_LIVE_CATEGORIES.includes(cat) || COMMISSIONING_CATEGORIES.includes(cat) ? 'warning' : 'info',
          title: `Readiness category gap — ${categoryLabel(cat)}`,
          description:
            `No readiness item exists for the "${categoryLabel(cat)}" category, which feeds the go-live / handover / ` +
            `commissioning sub-scores. The readiness picture is incomplete for this category.`,
          recommendation:
            `Add at least one readiness item for "${categoryLabel(cat)}" so its sub-score reflects real evidence rather than an assumed gap.`,
          refs: { category: cat },
        });
      }
    }

    findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
    this.logger.log(`Operational readiness validation for ${projectKey} (asOf ${asOfDate}): ${findings.length} finding(s) across ${items.length} item(s).`);
    return { projectKey, asOfDate, findings, itemsChecked: items.length };
  }

  /**
   * Operational-readiness composite (0..100) + status, plus three sub-scores.
   *   - score: average per-item progress (completionPct when present, else the
   *     per-status weight), mapped onto 0..100.
   *   - goLiveReadiness: average progress across handover + staffing items.
   *   - handoverReadiness: average progress across handover + om_manual +
   *     asset_register items.
   *   - commissioningReadiness: average progress across testing_commissioning
   *     items.
   * Status thresholds: >=80 green, >=60 yellow, >=40 orange, else red. With no
   * items the position is "red" (nothing evidenced = not ready), with an
   * explicit narrative.
   */
  async readinessScore(projectKey: string, asOfDate = '2026-06-12'): Promise<ReadinessScoreResult> {
    const items = await this.readiness.list(projectKey);
    const asOf = parseDate(asOfDate);

    const totals = this.totals(items, asOf);

    if (items.length === 0) {
      return {
        projectKey, asOfDate, score: 0, status: 'red',
        subScores: { goLiveReadiness: 0, handoverReadiness: 0, commissioningReadiness: 0 },
        items: 0, totals,
        narrative: 'No operational readiness items recorded — the project cannot be shown ready for go-live. Add O&M manuals, asset registers, training, testing & commissioning, handover, staffing, spares and warranty items to begin readiness governance.',
      };
    }

    const score = Math.round(avg(items.map((it) => progressOf(it))) * 100);
    const goLiveReadiness = this.subScore(items, GO_LIVE_CATEGORIES);
    const handoverReadiness = this.subScore(items, HANDOVER_CATEGORIES);
    const commissioningReadiness = this.subScore(items, COMMISSIONING_CATEGORIES);

    const subScores = {
      goLiveReadiness,
      handoverReadiness,
      commissioningReadiness,
    };
    const status: ReadinessScoreResult['status'] =
      score >= 80 ? 'green' : score >= 60 ? 'yellow' : score >= 40 ? 'orange' : 'red';

    const narrative = this.narrate(score, status, subScores, totals);
    this.logger.log(`Operational readiness for ${projectKey} (asOf ${asOfDate}): ${score}/100 (${status}).`);
    return { projectKey, asOfDate, score, status, subScores, items: items.length, totals, narrative };
  }

  // ── helpers ──

  /** Sub-score 0..100 = average per-item progress across the given categories. */
  private subScore(items: OperationalReadinessItem[], categories: string[]): number {
    const scoped = items.filter((it) => categories.includes(it.category));
    if (scoped.length === 0) return 0; // no evidence in this group → not ready.
    return Math.round(avg(scoped.map((it) => progressOf(it))) * 100);
  }

  private totals(items: OperationalReadinessItem[], asOf: Date): ReadinessScoreResult['totals'] {
    let complete = 0;
    let inProgress = 0;
    let notStarted = 0;
    let overdue = 0;
    const pcts: number[] = [];
    for (const it of items) {
      if (it.status === 'complete') complete += 1;
      else if (it.status === 'not_started') notStarted += 1;
      else inProgress += 1;
      if (it.dueDate && it.status !== 'complete') {
        const days = daysBetween(asOf, parseDate(it.dueDate));
        if (days < 0) overdue += 1;
      }
      if (typeof it.completionPct === 'number' && Number.isFinite(it.completionPct)) {
        pcts.push(it.completionPct);
      }
    }
    return {
      complete,
      inProgress,
      notStarted,
      overdue,
      avgCompletionPct: pcts.length ? round2(avg(pcts)) : null,
    };
  }

  private narrate(
    score: number,
    status: string,
    s: ReadinessScoreResult['subScores'],
    totals: ReadinessScoreResult['totals'],
  ): string {
    const band = status === 'green' ? 'ready' : status === 'yellow' ? 'nearly ready' : status === 'orange' ? 'not yet ready' : 'far from ready';
    const overdue = totals.overdue > 0 ? `${totals.overdue} overdue` : 'none overdue';
    return (
      `Operational readiness ${score}/100 (${band}). ` +
      `Go-live readiness ${s.goLiveReadiness}%, handover readiness ${s.handoverReadiness}%, ` +
      `commissioning readiness ${s.commissioningReadiness}%. ` +
      `Position: ${totals.complete} complete, ${totals.inProgress} in progress, ${totals.notStarted} not started; ${overdue}.`
    );
  }
}

// ── progress evaluation ──

/**
 * Per-item progress on 0..1: completionPct (when recorded) takes precedence,
 * otherwise the per-status weight. A "complete" status always counts as 1.0.
 */
function progressOf(it: OperationalReadinessItem): number {
  if (it.status === 'complete') return 1;
  if (typeof it.completionPct === 'number' && Number.isFinite(it.completionPct)) {
    return clamp01(it.completionPct / 100);
  }
  return STATUS_WEIGHT[it.status] ?? 0;
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    om_manual: 'O&M manual',
    asset_register: 'asset register',
    training: 'training',
    testing_commissioning: 'testing & commissioning',
    handover: 'handover',
    staffing: 'staffing',
    spares: 'spares',
    warranty: 'warranty',
  };
  return map[cat] ?? cat;
}

const SEV_ORDER: Record<ReadinessFinding['severity'], number> = { critical: 0, warning: 1, info: 2 };

// ── numeric + date utilities (deterministic, total) ──

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const avg = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** Parse an ISO date (YYYY-MM-DD) into a UTC Date; falls back to the platform date. */
function parseDate(s: string): Date {
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? new Date('2026-06-12T00:00:00Z') : d;
}

/** Whole days from `a` to `b` (positive when b is later). */
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
