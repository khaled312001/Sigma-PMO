import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Project, Scenario } from '../canonical/entities';

/**
 * Portfolio scenario planning (2026-06-12 Governance Configuration Center).
 *
 * Two read-only / pure-analysis surfaces over the simulation sandbox:
 *
 *  - `portfolioImpact()` — every OPEN Scenario across ALL projects, each with a
 *    best-effort impact summary parsed from its existing `summary` /
 *    `baselineSnapshot` fields. The snapshot today freezes a baseline (no
 *    before/after delta yet), so any `*Delta` figure is surfaced as a placeholder
 *    and clearly labelled — we never fabricate movement that the data doesn't carry.
 *
 *  - `portfolioWhatIf()` — DETERMINISTIC arithmetic only. For each project the
 *    caller injects a delay (days); we compute the shifted forecast finish and a
 *    naive cost-of-delay using an explicit, named-basis formula. NOTHING is
 *    persisted — this is pure analysis the caller can run freely.
 */

/** Overhead loading applied to the daily burn when pricing a slip. Named basis. */
export const COST_OF_DELAY_OVERHEAD_FACTOR = 0.15;

/** One open scenario, enriched with whatever impact the stored fields actually carry. */
export interface ScenarioImpactRow {
  id: string;
  name: string;
  projectBusinessKey: string;
  projectName: string | null;
  status: string;
  forkedFromAt: string;
  summary: string;
  /** Engine-generated scenarios tag a `kind` (e.g. clash-impact, compression). */
  kind: string | null;
  /**
   * Impact figures parsed from the snapshot when present. Today's fork snapshot
   * freezes a baseline only (no delta), so these are usually null → placeholder.
   */
  impact: {
    scheduleDeltaDays: number | null;
    costDelta: number | null;
    /** true when no real delta data exists on the snapshot (display as placeholder). */
    isPlaceholder: boolean;
    /** Baseline counters the snapshot does carry (real, not placeholder). */
    baseline: {
      activityCount: number | null;
      criticalAlerts: number | null;
      plannedFinish: string | null;
    };
  };
}

export interface PortfolioImpactResponse {
  scenarios: ScenarioImpactRow[];
  totals: {
    openScenarios: number;
    projectsWithScenarios: number;
  };
  /** Honest banner: every impact figure is a placeholder until snapshots carry deltas. */
  allImpactsArePlaceholders: boolean;
}

export interface WhatIfProjectRow {
  projectBusinessKey: string;
  projectName: string | null;
  /** Named basis: plannedFinish from the canonical project header. */
  currentForecastFinish: string | null;
  delayDays: number;
  /** plannedFinish + delayDays (calendar days). Null when no plannedFinish exists. */
  adjustedForecastFinish: string | null;
  budgetAtCompletion: number | null;
  plannedDurationDays: number | null;
  /** (BAC / plannedDurationDays) * delayDays * (1 + overhead). Null when bases missing. */
  costOfDelay: number | null;
  /** Per-row note when a basis is missing (so the caller knows why a figure is null). */
  note: string | null;
}

export interface PortfolioWhatIfResponse {
  basis: {
    overheadFactor: number;
    formula: string;
  };
  projects: WhatIfProjectRow[];
  totals: {
    projectsAnalyzed: number;
    totalDelayDays: number;
    totalCostOfDelay: number;
  };
}

@Injectable()
export class PortfolioScenarioService {
  constructor(
    @InjectRepository(Scenario) private readonly scenarios: Repository<Scenario>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
  ) {}

  /** Every OPEN scenario across the portfolio + a per-scenario impact summary. */
  async portfolioImpact(): Promise<PortfolioImpactResponse> {
    const open = await this.scenarios.find({
      where: { status: 'open' },
      order: { forkedFromAt: 'DESC' },
      take: 500,
    });

    // Resolve project display names in one pass (businessKey → current name).
    const keys = [...new Set(open.map((s) => s.projectBusinessKey))];
    const nameByKey = await this.resolveProjectNames(keys);

    const rows: ScenarioImpactRow[] = open.map((s) => {
      const snap = (s.baselineSnapshot ?? {}) as Record<string, unknown>;
      const kind = typeof snap.kind === 'string' ? snap.kind : null;
      const impact = parseImpact(snap);
      return {
        id: s.id,
        name: s.name,
        projectBusinessKey: s.projectBusinessKey,
        projectName: nameByKey.get(s.projectBusinessKey) ?? null,
        status: s.status,
        forkedFromAt: s.forkedFromAt.toISOString(),
        summary: s.summary ?? '',
        kind,
        impact,
      };
    });

    return {
      scenarios: rows,
      totals: {
        openScenarios: rows.length,
        projectsWithScenarios: keys.length,
      },
      allImpactsArePlaceholders:
        rows.length > 0 && rows.every((r) => r.impact.isPlaceholder),
    };
  }

  /**
   * Pure-analysis what-if: inject a per-project delay (days) and compute the
   * shifted forecast finish + naive cost-of-delay. Persists NOTHING.
   */
  async portfolioWhatIf(
    delayDaysPerProject: Record<string, number>,
  ): Promise<PortfolioWhatIfResponse> {
    if (!delayDaysPerProject || typeof delayDaysPerProject !== 'object') {
      throw new BadRequestException('delayDaysPerProject (Record<projectKey, number>) is required.');
    }
    const entries = Object.entries(delayDaysPerProject);
    if (entries.length === 0) {
      throw new BadRequestException('Provide at least one { projectKey: delayDays } entry.');
    }

    const projectRows: WhatIfProjectRow[] = [];
    let totalDelayDays = 0;
    let totalCostOfDelay = 0;

    for (const [projectBusinessKey, rawDelay] of entries) {
      const delayDays = Number(rawDelay);
      if (!Number.isFinite(delayDays) || delayDays < 0 || delayDays > 3650) {
        throw new BadRequestException(
          `delayDays for "${projectBusinessKey}" must be a number between 0 and 3650.`,
        );
      }

      const project = await this.projects.findOne({
        where: { businessKey: projectBusinessKey, isCurrent: true },
      });

      if (!project) {
        projectRows.push({
          projectBusinessKey,
          projectName: null,
          currentForecastFinish: null,
          delayDays,
          adjustedForecastFinish: null,
          budgetAtCompletion: null,
          plannedDurationDays: null,
          costOfDelay: null,
          note: 'No current project row — cannot project a finish or cost-of-delay.',
        });
        totalDelayDays += delayDays;
        continue;
      }

      const currentForecastFinish = project.plannedFinish ?? null;
      const adjustedForecastFinish = addCalendarDays(currentForecastFinish, delayDays);

      const bac = parseDecimal(project.budgetAtCompletion);
      const plannedDurationDays = computePlannedDurationDays(
        project.plannedStart,
        project.plannedFinish,
      );

      // Named basis: dailyBurn = BAC / plannedDurationDays;
      // costOfDelay = dailyBurn * delayDays * (1 + COST_OF_DELAY_OVERHEAD_FACTOR).
      let costOfDelay: number | null = null;
      let note: string | null = null;
      if (bac === null) {
        note = 'No budgetAtCompletion — cost-of-delay cannot be priced.';
      } else if (plannedDurationDays === null || plannedDurationDays <= 0) {
        note = 'No planned duration (plannedStart/plannedFinish) — cost-of-delay cannot be priced.';
      } else {
        const dailyBurn = bac / plannedDurationDays;
        costOfDelay =
          dailyBurn * delayDays * (1 + COST_OF_DELAY_OVERHEAD_FACTOR);
        costOfDelay = Math.round(costOfDelay * 100) / 100;
      }
      if (!currentForecastFinish) {
        note = note
          ? `${note} Also: no plannedFinish — forecast finish unavailable.`
          : 'No plannedFinish — forecast finish unavailable.';
      }

      projectRows.push({
        projectBusinessKey,
        projectName: project.name ?? null,
        currentForecastFinish,
        delayDays,
        adjustedForecastFinish,
        budgetAtCompletion: bac,
        plannedDurationDays,
        costOfDelay,
        note,
      });

      totalDelayDays += delayDays;
      if (costOfDelay !== null) totalCostOfDelay += costOfDelay;
    }

    return {
      basis: {
        overheadFactor: COST_OF_DELAY_OVERHEAD_FACTOR,
        formula:
          '(budgetAtCompletion / plannedDurationDays) * delayDays * (1 + overheadFactor)',
      },
      projects: projectRows,
      totals: {
        projectsAnalyzed: projectRows.length,
        totalDelayDays,
        totalCostOfDelay: Math.round(totalCostOfDelay * 100) / 100,
      },
    };
  }

  // ───────────────────────── internals ─────────────────────────

  private async resolveProjectNames(
    businessKeys: string[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (businessKeys.length === 0) return out;
    const rows = await this.projects.find({
      where: businessKeys.map((businessKey) => ({ businessKey, isCurrent: true })),
      select: { businessKey: true, name: true },
    });
    for (const r of rows) out.set(r.businessKey, r.name);
    return out;
  }
}

// ───────────────────────── pure helpers ─────────────────────────

/** Pull whatever real impact figures the snapshot carries; else mark placeholder. */
function parseImpact(snap: Record<string, unknown>): ScenarioImpactRow['impact'] {
  // Engine scenarios (clash-impact / compression) may carry explicit deltas.
  const scheduleDeltaDays = pickNumber(
    snap,
    'scheduleDeltaDays',
    'delayDays',
    'timeImpactDays',
  );
  const costDelta = pickNumber(snap, 'costDelta', 'costImpact', 'costOfDelay');

  const project = (snap.project ?? {}) as Record<string, unknown>;
  const schedule = (snap.schedule ?? {}) as Record<string, unknown>;
  const alerts = (snap.alerts ?? {}) as Record<string, unknown>;

  const baseline = {
    activityCount:
      typeof schedule.activityCount === 'number' ? schedule.activityCount : null,
    criticalAlerts: typeof alerts.critical === 'number' ? alerts.critical : null,
    plannedFinish:
      typeof project.plannedFinish === 'string' ? project.plannedFinish : null,
  };

  const isPlaceholder = scheduleDeltaDays === null && costDelta === null;

  return { scheduleDeltaDays, costDelta, isPlaceholder, baseline };
}

function pickNumber(obj: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

/** Decimal columns arrive as strings from the MySQL driver — parse defensively. */
function parseDecimal(value: string | null): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Inclusive day-count between two YYYY-MM-DD dates (>=1 when both present). */
function computePlannedDurationDays(
  start: string | null,
  finish: string | null,
): number | null {
  if (!start || !finish) return null;
  const s = Date.parse(start);
  const f = Date.parse(finish);
  if (Number.isNaN(s) || Number.isNaN(f) || f < s) return null;
  return Math.round((f - s) / (24 * 60 * 60 * 1000)) + 1;
}

/** Add N calendar days to a YYYY-MM-DD date, returning YYYY-MM-DD. */
function addCalendarDays(date: string | null, days: number): string | null {
  if (!date) return null;
  const t = Date.parse(date);
  if (Number.isNaN(t)) return null;
  const shifted = new Date(t + days * 24 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}
