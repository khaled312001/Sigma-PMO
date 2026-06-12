import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GovernanceStatus, GOVERNANCE_STATUS_RANK } from '../../common/enums';
import {
  FundingFacility,
  LifecycleLedgerEntry,
  ProcurementFinding,
  Project,
} from '../canonical/entities';
import { SnapshotService } from '../rules/snapshot.service';

/**
 * Default analysis "as of" date. Predictive Governance is deterministic and
 * reproducible: we NEVER read the wall clock — every forecast that needs a
 * notion of "now" (schedule elapsed, days-to-maturity) takes this anchor, so
 * the same inputs always yield the same forecasts.
 */
export const PREDICTIVE_AS_OF = '2026-06-12';

/** Severity bands shared by every forecast (drives the UI colour + status). */
export type ForecastSeverity = 'low' | 'medium' | 'high' | 'critical';

/** One deterministic forecast — value + how it was derived + its evidence. */
export interface Forecast {
  /** Stable machine key, e.g. `forecastCostOverrunPct`. */
  metric: string;
  /** Human title (English; the UI translates per-metric). */
  label: string;
  /** The forecast value. Null when there is no data to forecast from. */
  value: number | null;
  /** Unit hint for the UI: `pct` | `days` | `score` (0–100). */
  unit: 'pct' | 'days' | 'score';
  severity: ForecastSeverity;
  /** The explicit named formula / inputs this number came from. */
  basis: string;
  /** Recommended deterministic action for this forecast. */
  recommendedAction: string;
  /** References to the rows/figures that fed the forecast (audit trail). */
  evidenceRefs: Array<Record<string, unknown>>;
}

/** The full predictive picture for one project. */
export interface PredictionResult {
  projectKey: string;
  asOfDate: string;
  forecasts: Forecast[];
  /** Worst-of the five forecasts' contributed statuses. */
  predictiveGovernanceStatus: GovernanceStatus;
  /** One-line deterministic headline. */
  headline: string;
}

const round = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
};
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
/** Whole days between two ISO dates (a−b); negative if a is before b. */
const daysBetween = (a: string, b: string): number => {
  const ms = Date.parse(a) - Date.parse(b);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : 0;
};

/** Map each forecast's severity to the governance status it contributes. */
const SEVERITY_STATUS: Record<ForecastSeverity, GovernanceStatus> = {
  low: GovernanceStatus.GREEN,
  medium: GovernanceStatus.YELLOW,
  high: GovernanceStatus.ORANGE,
  critical: GovernanceStatus.RED,
};

/**
 * PredictionService — Predictive Governance (Mr. Ayham, 2026-06-12 active
 * scope). Stateless, deterministic forecasts (NO new entities, NO randomness,
 * NO wall-clock): every number comes from an explicit named formula over the
 * current canonical world state. Produces FIVE forecasts — cost-overrun,
 * schedule-delay, revenue-gap, procurement-risk, funding-risk — plus a
 * worst-of predictive governance status. AI only narrates these figures.
 */
@Injectable()
export class PredictionService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(ProcurementFinding) private readonly procFindings: Repository<ProcurementFinding>,
    @InjectRepository(FundingFacility) private readonly facilities: Repository<FundingFacility>,
    @InjectRepository(LifecycleLedgerEntry) private readonly ledger: Repository<LifecycleLedgerEntry>,
    private readonly snapshots: SnapshotService,
  ) {}

  /** The five forecasts + worst-of status for one project. */
  async forecast(projectKey: string, asOfDate: string = PREDICTIVE_AS_OF): Promise<PredictionResult> {
    if (!projectKey) throw new NotFoundException('projectKey is required');
    const project = await this.projects.findOne({ where: { businessKey: projectKey, isCurrent: true } });
    if (!project) throw new NotFoundException(`No current project "${projectKey}"`);

    // Resolve the current Activity rows the same way analytics does (the
    // canonical snapshot loader scopes current children across project versions).
    const snap = await this.snapshots.load(project.id);
    const activities = snap.activities;

    const cost = this.forecastCostOverrunPct(activities, asOfDate);
    const schedule = this.forecastScheduleDelayDays(activities, project.dataDate ?? null, asOfDate);
    const revenue = await this.forecastRevenueGap(projectKey, asOfDate);
    const procurement = await this.forecastProcurementRisk(projectKey, asOfDate);
    const funding = await this.forecastFundingRisk(projectKey, asOfDate);

    const forecasts = [cost, schedule, revenue, procurement, funding];
    const predictiveGovernanceStatus = forecasts.reduce<GovernanceStatus>((worst, f) => {
      const s = SEVERITY_STATUS[f.severity];
      return GOVERNANCE_STATUS_RANK[s] > GOVERNANCE_STATUS_RANK[worst] ? s : worst;
    }, GovernanceStatus.GREEN);

    return {
      projectKey,
      asOfDate,
      forecasts,
      predictiveGovernanceStatus,
      headline: this.headline(projectKey, forecasts, predictiveGovernanceStatus),
    };
  }

  // ───────────────────── 1. Cost overrun (CPI-based EAC) ─────────────────────

  /**
   * forecastCostOverrunPct — EV=Σ(budgetedCost×actualPct), AC=Σ(actualCost),
   * CPI=EV/AC, overrun = 1/CPI − 1 (the projected % over budget at completion).
   */
  private forecastCostOverrunPct(
    activities: Array<{ budgetedCost: string | null; actualCost: string | null; actualPctComplete: number | null }>,
    asOfDate: string,
  ): Forecast {
    let ev = 0, ac = 0, costed = 0;
    for (const a of activities) {
      const budget = num(a.budgetedCost);
      ev += budget * clamp01(num(a.actualPctComplete));
      ac += num(a.actualCost);
      if (budget > 0) costed += 1;
    }
    const cpi = ac > 0 ? ev / ac : null;
    const overrunPct = cpi !== null && cpi > 0 ? round((1 / cpi - 1) * 100) : null;

    // Over budget = positive overrun. Bands: ≤2% low, ≤7% medium, ≤15% high, else critical.
    const severity: ForecastSeverity =
      overrunPct === null ? 'low'
      : overrunPct <= 2 ? 'low'
      : overrunPct <= 7 ? 'medium'
      : overrunPct <= 15 ? 'high'
      : 'critical';

    return {
      metric: 'forecastCostOverrunPct',
      label: 'Forecast cost overrun',
      value: overrunPct,
      unit: 'pct',
      severity,
      basis: cpi !== null
        ? `EV ${round(ev).toLocaleString()} ÷ AC ${round(ac).toLocaleString()} = CPI ${round3(cpi)}; overrun = 1/CPI − 1 over ${costed} costed activities (as of ${asOfDate}).`
        : `No actual cost recorded across ${activities.length} activities — no CPI to project an overrun from.`,
      recommendedAction:
        overrunPct === null ? 'Capture actual cost on in-progress activities so EVM cost forecasting becomes meaningful.'
        : overrunPct <= 2 ? 'Cost performance on plan — maintain current cost controls.'
        : overrunPct <= 7 ? 'Mild cost drift — review the worst-CPI work packages and tighten commitment controls.'
        : overrunPct <= 15 ? 'Material overrun trend — escalate a recovery plan and re-baseline the cost estimate.'
        : 'Severe overrun trajectory — invoke change control, freeze discretionary spend, and re-forecast EAC with the cost lead.',
      evidenceRefs: [
        { type: 'evm', ev: round(ev), ac: round(ac), cpi: cpi === null ? null : round3(cpi), costedActivityCount: costed },
      ],
    };
  }

  // ──────────────────── 2. Schedule delay (SPI-based slip) ────────────────────

  /**
   * forecastScheduleDelayDays — PV=Σ(budgetedCost×plannedPct),
   * EV=Σ(budgetedCost×actualPct), SPI=EV/PV, delay = max(0,(1/SPI−1)×plannedElapsedDays),
   * where plannedElapsedDays = earliest plannedStart → (dataDate ?? asOf).
   */
  private forecastScheduleDelayDays(
    activities: Array<{ budgetedCost: string | null; plannedStart: string | null; plannedPctComplete: number | null; actualPctComplete: number | null }>,
    dataDate: string | null,
    asOfDate: string,
  ): Forecast {
    let pv = 0, ev = 0;
    let earliestStart: string | null = null;
    for (const a of activities) {
      const budget = num(a.budgetedCost);
      pv += budget * clamp01(num(a.plannedPctComplete));
      ev += budget * clamp01(num(a.actualPctComplete));
      if (a.plannedStart && (earliestStart === null || a.plannedStart < earliestStart)) {
        earliestStart = a.plannedStart;
      }
    }
    const spi = pv > 0 ? ev / pv : null;
    const endRef = dataDate ?? asOfDate;
    const plannedElapsedDays = earliestStart ? Math.max(0, daysBetween(endRef, earliestStart)) : 0;
    const delayDays = spi !== null && spi > 0
      ? Math.max(0, Math.round((1 / spi - 1) * plannedElapsedDays))
      : null;

    // Bands (days): ≤5 low, ≤20 medium, ≤45 high, else critical.
    const severity: ForecastSeverity =
      delayDays === null ? 'low'
      : delayDays <= 5 ? 'low'
      : delayDays <= 20 ? 'medium'
      : delayDays <= 45 ? 'high'
      : 'critical';

    return {
      metric: 'forecastScheduleDelayDays',
      label: 'Forecast schedule delay',
      value: delayDays,
      unit: 'days',
      severity,
      basis: spi !== null
        ? `EV ${round(ev).toLocaleString()} ÷ PV ${round(pv).toLocaleString()} = SPI ${round3(spi)}; delay = max(0,(1/SPI − 1) × ${plannedElapsedDays}d planned-elapsed) from earliest start ${earliestStart ?? 'n/a'} to ${endRef}.`
        : `No planned value (PV = 0) — no SPI to project a schedule slip from across ${activities.length} activities.`,
      recommendedAction:
        delayDays === null ? 'Load a planned-progress baseline so SPI and schedule-slip forecasting become available.'
        : delayDays <= 5 ? 'Schedule on plan — sustain critical-path monitoring.'
        : delayDays <= 20 ? 'Minor slip forming — fast-track near-critical activities and confirm float consumption.'
        : delayDays <= 45 ? 'Significant slip trajectory — build a schedule-recovery plan and reassess milestone dates.'
        : 'Severe slip forecast — escalate to a formal recovery schedule; re-sequence the critical path with the planning lead.',
      evidenceRefs: [
        { type: 'earned-schedule', pv: round(pv), ev: round(ev), spi: spi === null ? null : round3(spi), plannedElapsedDays, earliestStart, endRef },
      ],
    };
  }

  // ─────────────────── 3. Revenue gap (forecast vs actual) ───────────────────

  /**
   * forecastRevenueGap — from the revenue lifecycle ledger: current rev_forecast
   * vs the latest actual (latest current row among actual_revenue / collections /
   * rev_reforecast / rev_final). gap% = (forecast − actual) / forecast. Null when
   * there is no forecast row to compare against.
   */
  private async forecastRevenueGap(projectKey: string, asOfDate: string): Promise<Forecast> {
    const rows = await this.ledger.find({
      where: { projectBusinessKey: projectKey, dimension: 'revenue', isCurrent: true },
    });

    const latestOf = (stages: string[]): LifecycleLedgerEntry | null => {
      const matching = rows.filter((r) => stages.includes(r.stage));
      if (matching.length === 0) return null;
      // Deterministic "latest": newest createdAt, tie-broken by id.
      return matching.reduce((best, r) => {
        const bt = best.createdAt instanceof Date ? best.createdAt.getTime() : 0;
        const rt = r.createdAt instanceof Date ? r.createdAt.getTime() : 0;
        if (rt > bt) return r;
        if (rt === bt && r.id > best.id) return r;
        return best;
      });
    };

    const forecastRow = latestOf(['rev_forecast']);
    const actualRow = latestOf(['actual_revenue', 'collections', 'rev_reforecast', 'rev_final']);

    if (!forecastRow || !actualRow) {
      return {
        metric: 'forecastRevenueGap',
        label: 'Forecast revenue gap',
        value: null,
        unit: 'pct',
        severity: 'low',
        basis: `No revenue ${!forecastRow ? 'forecast' : 'actual'} recorded in the revenue ledger for ${projectKey} — nothing to compare (as of ${asOfDate}).`,
        recommendedAction: 'Record a revenue forecast and at least one actual/collection on the Revenue Governance surface to enable revenue forecasting.',
        evidenceRefs: [],
      };
    }

    const forecastVal = num(forecastRow.value);
    const actualVal = num(actualRow.value);
    // Positive gap = actual BELOW forecast (a shortfall risk).
    const gapPct = forecastVal !== 0 ? round(((forecastVal - actualVal) / forecastVal) * 100) : null;

    const severity: ForecastSeverity =
      gapPct === null ? 'low'
      : gapPct <= 5 ? 'low'
      : gapPct <= 15 ? 'medium'
      : gapPct <= 30 ? 'high'
      : 'critical';

    return {
      metric: 'forecastRevenueGap',
      label: 'Forecast revenue gap',
      value: gapPct,
      unit: 'pct',
      severity,
      basis: `Revenue forecast ${forecastVal.toLocaleString()} vs latest actual ${actualVal.toLocaleString()} (${actualRow.stage}); gap = (forecast − actual) / forecast (as of ${asOfDate}).`,
      recommendedAction:
        gapPct === null ? 'Forecast value is zero — verify the recorded revenue forecast.'
        : gapPct <= 5 ? 'Revenue tracking to plan — maintain billing and collections cadence.'
        : gapPct <= 15 ? 'Emerging revenue shortfall — review billing milestones and collection ageing.'
        : gapPct <= 30 ? 'Material revenue gap — escalate to commercial; reforecast revenue and protect cash.'
        : 'Severe revenue shortfall — trigger a revenue-recovery review and reassess the investment case (NPV/IRR).',
      evidenceRefs: [
        { type: 'ledger', stage: 'rev_forecast', value: forecastVal, ref: forecastRow.id },
        { type: 'ledger', stage: actualRow.stage, value: actualVal, ref: actualRow.id },
      ],
    };
  }

  // ───────────────────── 4. Procurement risk (0–100) ─────────────────────

  /**
   * forecastProcurementRisk — a 0–100 score from OPEN ProcurementFinding rows,
   * weighted by severity (critical 25, warning 10, info 3), capped at 100. The
   * forward-looking procurement-disruption pressure on the project.
   */
  private async forecastProcurementRisk(projectKey: string, asOfDate: string): Promise<Forecast> {
    const open = await this.procFindings.find({
      where: { projectBusinessKey: projectKey, status: 'open' },
    });
    const counts = { critical: 0, warning: 0, info: 0 };
    for (const f of open) {
      if (f.severity === 'critical') counts.critical += 1;
      else if (f.severity === 'warning') counts.warning += 1;
      else counts.info += 1;
    }
    const raw = counts.critical * 25 + counts.warning * 10 + counts.info * 3;
    const score = Math.min(100, raw);

    // Score bands: ≤15 low, ≤40 medium, ≤70 high, else critical.
    const severity: ForecastSeverity =
      score <= 15 ? 'low'
      : score <= 40 ? 'medium'
      : score <= 70 ? 'high'
      : 'critical';

    return {
      metric: 'forecastProcurementRisk',
      label: 'Forecast procurement risk',
      value: score,
      unit: 'score',
      severity,
      basis: `${open.length} open procurement finding(s): ${counts.critical} critical×25 + ${counts.warning} warning×10 + ${counts.info} info×3 = ${raw}, capped at 100 (as of ${asOfDate}).`,
      recommendedAction:
        score <= 15 ? 'Procurement exposure contained — continue routine supplier and delivery monitoring.'
        : score <= 40 ? 'Watch open procurement findings — expedite long-lead items and confirm delivery dates.'
        : score <= 70 ? 'Elevated procurement risk — escalate critical findings and activate alternate-supplier options.'
        : 'Severe procurement risk — convene supply-chain crisis review; the critical findings threaten delivery.',
      evidenceRefs: [
        { type: 'procurement-findings', open: open.length, ...counts },
      ],
    };
  }

  // ─────────────────────── 5. Funding risk (0–100) ───────────────────────

  /**
   * forecastFundingRisk — a 0–100 score from current FundingFacility rows:
   * the worst DSCR headroom below covenant + facilities near maturity (≤12
   * months from asOf) + any breached/refinanced status. Higher = riskier.
   */
  private async forecastFundingRisk(projectKey: string, asOfDate: string): Promise<Forecast> {
    const rows = await this.facilities.find({
      where: { projectBusinessKey: projectKey, isCurrent: true },
    });
    const active = rows.filter((f) => f.status !== 'closed');

    if (active.length === 0) {
      return {
        metric: 'forecastFundingRisk',
        label: 'Forecast funding risk',
        value: 0,
        unit: 'score',
        severity: 'low',
        basis: `No active funding facilities recorded for ${projectKey} — no debt-service or covenant exposure (as of ${asOfDate}).`,
        recommendedAction: 'No funding exposure to manage. Record facilities on Funding Governance if debt is taken on.',
        evidenceRefs: [],
      };
    }

    let dscrPressure = 0; // 0..60
    let worstHeadroom: number | null = null;
    let maturityPressure = 0; // 0..30
    let nearestMaturityDays: number | null = null;
    let statusPressure = 0; // 0..30
    const breached: string[] = [];

    for (const f of active) {
      // DSCR headroom: (current − covenant); negative = covenant breach.
      if (f.currentDscr !== null && f.dscrCovenant !== null) {
        const headroom = round3(f.currentDscr - f.dscrCovenant);
        if (worstHeadroom === null || headroom < worstHeadroom) worstHeadroom = headroom;
        if (headroom < 0) dscrPressure = Math.max(dscrPressure, Math.min(60, 30 + Math.abs(headroom) * 100));
        else if (headroom < 0.1) dscrPressure = Math.max(dscrPressure, 25);
        else if (headroom < 0.25) dscrPressure = Math.max(dscrPressure, 12);
      }
      // Near maturity: ≤12 months out adds pressure (closer = more).
      if (f.maturityDate) {
        const d = daysBetween(f.maturityDate, asOfDate);
        if (nearestMaturityDays === null || d < nearestMaturityDays) nearestMaturityDays = d;
        if (d <= 0) maturityPressure = Math.max(maturityPressure, 30);
        else if (d <= 365) maturityPressure = Math.max(maturityPressure, Math.round((1 - d / 365) * 30));
      }
      if (f.status === 'breached') { statusPressure = Math.max(statusPressure, 30); breached.push(f.businessKey); }
      else if (f.status === 'refinanced') statusPressure = Math.max(statusPressure, 12);
    }

    const score = Math.min(100, Math.round(dscrPressure + maturityPressure + statusPressure));
    const severity: ForecastSeverity =
      score <= 15 ? 'low'
      : score <= 40 ? 'medium'
      : score <= 70 ? 'high'
      : 'critical';

    return {
      metric: 'forecastFundingRisk',
      label: 'Forecast funding risk',
      value: score,
      unit: 'score',
      severity,
      basis: `${active.length} active facility(ies): worst DSCR headroom ${worstHeadroom === null ? 'n/a' : worstHeadroom} (DSCR pressure ${Math.round(dscrPressure)}), nearest maturity ${nearestMaturityDays === null ? 'n/a' : `${nearestMaturityDays}d`} (pressure ${Math.round(maturityPressure)}), status pressure ${Math.round(statusPressure)}${breached.length ? ` [breached: ${breached.join(', ')}]` : ''} (as of ${asOfDate}).`,
      recommendedAction:
        score <= 15 ? 'Funding healthy — maintain covenant reporting and the debt-service schedule.'
        : score <= 40 ? 'Monitor DSCR headroom and upcoming maturities — model a downside DSCR case.'
        : score <= 70 ? 'Elevated funding risk — engage lenders early on covenant headroom and refinancing of near-maturity facilities.'
        : 'Severe funding risk — a covenant breach and/or imminent maturity threatens solvency; escalate refinancing/waiver discussions now.',
      evidenceRefs: [
        { type: 'funding-facilities', active: active.length, worstDscrHeadroom: worstHeadroom, nearestMaturityDays, breached },
      ],
    };
  }

  // ─────────────────────────────── headline ───────────────────────────────

  private headline(projectKey: string, forecasts: Forecast[], status: GovernanceStatus): string {
    const worst = forecasts
      .filter((f) => f.value !== null)
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0];
    const driver = worst ? `${worst.label.toLowerCase()} (${formatValue(worst)})` : 'insufficient data to forecast';
    return `Predictive governance for ${projectKey}: ${status.toUpperCase()} — primary driver ${driver}.`;
  }
}

const severityRank = (s: ForecastSeverity): number => ({ low: 0, medium: 1, high: 2, critical: 3 }[s]);

function formatValue(f: Forecast): string {
  if (f.value === null) return '—';
  if (f.unit === 'pct') return `${f.value}%`;
  if (f.unit === 'days') return `${f.value}d`;
  return `${f.value}/100`;
}
