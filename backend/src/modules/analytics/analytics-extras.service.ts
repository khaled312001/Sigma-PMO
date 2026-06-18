import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { companyScope } from '../../common/tenant/tenant-context';
import { AnalyticsSnapshot, Project } from '../canonical/entities';
import { SnapshotService } from '../rules/snapshot.service';
import { AnalyticsAgentService } from './analytics-agent.service';
import { EvmService } from './evm.service';
import { EarnedScheduleResult, EarnedScheduleService } from './earned-schedule.service';

export interface TrendPoint {
  computedAt: string;
  spi: number | null;
  cpi: number | null;
}
export type TrendDirection = 'improving' | 'stable' | 'deteriorating';
export interface TrendSeries {
  metric: 'spi' | 'cpi';
  points: Array<{ computedAt: string; value: number }>;
  /** Least-squares slope per 30 days (positive = rising). */
  slopePer30Days: number | null;
  direction: TrendDirection;
  latest: number | null;
}
export interface TrendsResult {
  projectKey: string;
  sampleCount: number;
  history: TrendPoint[];
  spi: TrendSeries;
  cpi: TrendSeries;
  basis: string;
}

export interface PortfolioProjectRow {
  projectKey: string;
  name: string;
  programBusinessKey: string | null;
  portfolioBusinessKey: string | null;
  pv: number;
  ev: number;
  ac: number;
  bac: number;
  spi: number | null;
  cpi: number | null;
}
export interface PortfolioResult {
  projectCount: number;
  totals: { pv: number; ev: number; ac: number; bac: number };
  /** BAC-weighted averages of the per-project indices. */
  weightedSpi: number | null;
  weightedCpi: number | null;
  rows: PortfolioProjectRow[];
  basis: string;
}

/**
 * AnalyticsExtrasService — L4 extensions beyond the base EVM agent:
 *  - Earned Schedule (time-based forecasting) for one project.
 *  - SPI/CPI trends from the append-only AnalyticsSnapshot history.
 *  - A whole-estate portfolio roll-up across every current project.
 *
 * Deterministic throughout — every number comes from canonical rows or the
 * snapshot time series, never an LLM.
 */
@Injectable()
export class AnalyticsExtrasService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(AnalyticsSnapshot) private readonly snapshots: Repository<AnalyticsSnapshot>,
    private readonly snapshotSvc: SnapshotService,
    private readonly evm: EvmService,
    private readonly es: EarnedScheduleService,
    private readonly analytics: AnalyticsAgentService,
  ) {}

  /** Earned Schedule for one project (Lipke time-based forecasting). */
  async earnedSchedule(projectKey: string): Promise<EarnedScheduleResult & { projectKey: string }> {
    const project = await this.projects.findOne({
      where: { businessKey: projectKey, isCurrent: true },
    });
    if (!project) throw new NotFoundException(`No current project "${projectKey}"`);
    const snap = await this.snapshotSvc.load(project.id);

    const evm = this.evm.compute(
      snap.activities.map((a) => ({
        budgetedCost: a.budgetedCost === null ? null : Number.parseFloat(a.budgetedCost),
        actualCost: a.actualCost === null ? null : Number.parseFloat(a.actualCost),
        plannedPctComplete: a.plannedPctComplete,
        actualPctComplete: a.actualPctComplete,
      })),
    );

    const result = this.es.compute({
      projectPlannedStart: project.plannedStart,
      projectPlannedFinish: project.plannedFinish,
      dataDate: project.dataDate,
      ev: evm.ev,
      activities: snap.activities.map((a) => ({
        budgetedCost: a.budgetedCost === null ? null : Number.parseFloat(a.budgetedCost),
        plannedStart: a.plannedStart,
        plannedFinish: a.plannedFinish,
      })),
    });
    return { projectKey, ...result };
  }

  /** SPI/CPI trends with least-squares slope per 30 days from snapshot history. */
  async trends(projectKey: string): Promise<TrendsResult> {
    const rows = await this.snapshots.find({
      where: { nodeBusinessKey: projectKey },
      order: { computedAt: 'ASC' },
    });
    const history: TrendPoint[] = rows.map((r) => ({
      computedAt: toIso(r.computedAt),
      spi: numOrNull((r.evm as Record<string, unknown>)?.['spi']),
      cpi: numOrNull((r.evm as Record<string, unknown>)?.['cpi']),
    }));

    const spi = this.buildSeries('spi', rows);
    const cpi = this.buildSeries('cpi', rows);

    return {
      projectKey,
      sampleCount: rows.length,
      history,
      spi,
      cpi,
      basis:
        'Least-squares linear regression of each index against time (per-30-day slope). ' +
        'Direction: |slope| < 0.01 → stable; positive → improving; negative → deteriorating.',
    };
  }

  /** Whole-estate portfolio roll-up across every current project (company-scoped). */
  async portfolio(): Promise<PortfolioResult> {
    const projects = await this.projects.find({ where: { isCurrent: true, ...companyScope() } });
    const rows: PortfolioProjectRow[] = [];
    const totals = { pv: 0, ev: 0, ac: 0, bac: 0 };
    let spiWeightNum = 0;
    let cpiWeightNum = 0;
    let spiWeightDen = 0;
    let cpiWeightDen = 0;

    for (const p of projects) {
      let r;
      try {
        r = await this.analytics.computeProject(p.businessKey);
      } catch {
        continue; // skip projects with no analysable activities
      }
      const e = r.evm;
      totals.pv += e.pv;
      totals.ev += e.ev;
      totals.ac += e.ac;
      totals.bac += e.bac;
      if (e.spi !== null && e.bac > 0) { spiWeightNum += e.spi * e.bac; spiWeightDen += e.bac; }
      if (e.cpi !== null && e.bac > 0) { cpiWeightNum += e.cpi * e.bac; cpiWeightDen += e.bac; }
      rows.push({
        projectKey: p.businessKey,
        name: p.name,
        programBusinessKey: p.programBusinessKey,
        portfolioBusinessKey: p.portfolioBusinessKey,
        pv: e.pv, ev: e.ev, ac: e.ac, bac: e.bac, spi: e.spi, cpi: e.cpi,
      });
    }
    rows.sort((a, b) => b.bac - a.bac);

    return {
      projectCount: rows.length,
      totals: {
        pv: round2(totals.pv), ev: round2(totals.ev),
        ac: round2(totals.ac), bac: round2(totals.bac),
      },
      weightedSpi: spiWeightDen > 0 ? round3(spiWeightNum / spiWeightDen) : null,
      weightedCpi: cpiWeightDen > 0 ? round3(cpiWeightNum / cpiWeightDen) : null,
      rows,
      basis:
        'Totals are simple sums of each project’s PV/EV/AC/BAC. ' +
        'Weighted SPI/CPI are BAC-weighted averages of the per-project indices.',
    };
  }

  // ──────────────────────── helpers ────────────────────────

  private buildSeries(metric: 'spi' | 'cpi', rows: AnalyticsSnapshot[]): TrendSeries {
    const points: Array<{ computedAt: string; value: number; t: number }> = [];
    let firstMs: number | null = null;
    for (const r of rows) {
      const v = numOrNull((r.evm as Record<string, unknown>)?.[metric]);
      if (v === null) continue;
      const ms = r.computedAt instanceof Date ? r.computedAt.getTime() : Date.parse(String(r.computedAt));
      if (firstMs === null) firstMs = ms;
      points.push({ computedAt: toIso(r.computedAt), value: v, t: (ms - firstMs) / (30 * DAY_MS) });
    }
    const slope = leastSquaresSlope(points.map((p) => ({ x: p.t, y: p.value })));
    let direction: TrendDirection = 'stable';
    if (slope !== null) {
      if (slope > 0.01) direction = 'improving';
      else if (slope < -0.01) direction = 'deteriorating';
    }
    return {
      metric,
      points: points.map((p) => ({ computedAt: p.computedAt, value: p.value })),
      slopePer30Days: slope === null ? null : round3(slope),
      direction,
      latest: points.length > 0 ? points[points.length - 1].value : null,
    };
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ordinary-least-squares slope of y on x. Null when <2 points or no x-spread. */
function leastSquaresSlope(pts: Array<{ x: number; y: number }>): number | null {
  const n = pts.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of pts) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return null;
  return (n * sxy - sx * sy) / denom;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number.parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}
function toIso(d: Date | string): string {
  const ms = d instanceof Date ? d.getTime() : Date.parse(String(d));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : String(d);
}
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;
