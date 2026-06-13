import { Injectable, Logger } from '@nestjs/common';

import { UtilityConnection } from '../canonical/entities/utility-connection.entity';
import { UtilityService } from './utility.service';

/** A single utility governance finding (NOT persisted — utility owns its entity but findings are computed). */
export interface UtilityFinding {
  type:
    | 'delay-exposure'
    | 'required-by-breach'
    | 'stuck-not-started'
    | 'forecast-missing'
    | 'connection-ready';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation: string;
  /** References tying the finding back to its connection + computed quantum. */
  refs: Record<string, unknown>;
}

/** One forecast-connection-date row. */
export interface ForecastDate {
  businessKey: string;
  title: string;
  utilityType: string;
  status: string;
  forecastConnectionDate: string | null;
  requiredByDate: string | null;
  /** max(0, daysBetween(requiredByDate, forecastConnectionDate ?? asOf)). */
  delayExposureDays: number;
}

/** The composite utility-readiness result. */
export interface UtilityScoreResult {
  projectKey: string;
  asOfDate: string;
  /** 0..100 Utility Readiness Index. */
  score: number;
  status: 'green' | 'yellow' | 'orange' | 'red';
  connections: number;
  totals: {
    connected: number;
    inFlight: number;
    notStarted: number;
    atRisk: number;
    maxDelayExposureDays: number;
    totalDelayExposureDays: number;
  };
  forecasts: ForecastDate[];
  narrative: string;
}

/**
 * UtilityGovernanceService — the deterministic utility governance engine
 * (Mr. Ayham, 2026-06-13 17-stage lifecycle scope). Reads a project's utility
 * connections and derives, from explicit named formulas, the utility readiness
 * signals — the Utility Readiness Index, per-connection delay exposure, required-by
 * breaches and stuck not-started connections — plus the forecast-connection-date
 * list. Pure deterministic (every number from a named formula); `asOfDate` is the
 * only time input. The AI layer only narrates these later. Findings are computed
 * on demand from the connection state.
 */
@Injectable()
export class UtilityGovernanceService {
  private readonly logger = new Logger(UtilityGovernanceService.name);

  /**
   * Per-status progress weight (0..1) — drives the Utility Readiness Index.
   *   not_started 0 · applied 0.2 · in_progress 0.5 · testing 0.75 · energized 0.9 · connected 1.
   */
  private static readonly STATUS_PROGRESS: Record<string, number> = {
    not_started: 0,
    applied: 0.2,
    in_progress: 0.5,
    testing: 0.75,
    energized: 0.9,
    connected: 1,
  };

  /** A not_started connection is "stuck" when its required-by date is within this window of as-of. */
  private static readonly STUCK_WINDOW_DAYS = 60;

  constructor(private readonly utility: UtilityService) {}

  /** Progress weight for a status (unknown statuses count as 0). */
  private progressOf(status: string): number {
    return UtilityGovernanceService.STATUS_PROGRESS[status] ?? 0;
  }

  /**
   * Per-connection delay exposure in days:
   *   max(0, daysBetween(requiredByDate, forecastConnectionDate ?? asOf)).
   * A connection with no requiredByDate has zero exposure (nothing to breach).
   */
  private delayExposureDays(c: UtilityConnection, asOf: Date): number {
    if (!c.requiredByDate) return 0;
    const requiredBy = parseDate(c.requiredByDate);
    const compareTo = c.forecastConnectionDate ? parseDate(c.forecastConnectionDate) : asOf;
    return Math.max(0, daysBetween(requiredBy, compareTo));
  }

  /**
   * Validate the utility position and return findings (not persisted). One pass
   * over every current connection raising the deterministic signals. Pure —
   * `asOfDate` is the only time input, so the result is reproducible.
   */
  async validate(projectKey: string, asOfDate = '2026-06-12'): Promise<{
    projectKey: string;
    asOfDate: string;
    findings: UtilityFinding[];
    connectionsChecked: number;
  }> {
    const connections = await this.utility.list(projectKey);
    const asOf = parseDate(asOfDate);
    const findings: UtilityFinding[] = [];

    for (const c of connections) {
      const label = `${c.businessKey} — ${c.title}`;
      const exposure = this.delayExposureDays(c, asOf);
      const isConnected = c.status === 'connected';

      // 1) Required-by breach: forecastConnectionDate > requiredByDate.
      if (!isConnected && c.requiredByDate && c.forecastConnectionDate) {
        const requiredBy = parseDate(c.requiredByDate);
        const forecast = parseDate(c.forecastConnectionDate);
        if (daysBetween(requiredBy, forecast) > 0) {
          const slip = daysBetween(requiredBy, forecast);
          findings.push({
            type: 'required-by-breach',
            severity: slip > 60 ? 'critical' : 'warning',
            title: `Forecast slips past required-by (${slip}d) — ${label}`,
            description:
              `Forecast connection ${c.forecastConnectionDate} is ${slip} day(s) after the required-by date ` +
              `${c.requiredByDate}. The ${utilityTypeName(c.utilityType)} connection is forecast to be late for delivery.`,
            recommendation:
              'Escalate with the utility provider, pursue a temporary/standby supply, and re-sequence dependent ' +
              'activities; a late primary connection can block handover and energization milestones.',
            refs: { businessKey: c.businessKey, requiredByDate: c.requiredByDate, forecastConnectionDate: c.forecastConnectionDate, slipDays: slip },
          });
        }
      }

      // 2) Delay exposure: max(0, daysBetween(requiredBy, forecast ?? asOf)) > 0 with no firm forecast.
      if (!isConnected && exposure > 0 && !c.forecastConnectionDate) {
        findings.push({
          type: 'delay-exposure',
          severity: exposure > 60 ? 'critical' : 'warning',
          title: `Delay exposure ${exposure}d (no firm forecast) — ${label}`,
          description:
            `The required-by date ${c.requiredByDate} has passed relative to ${asOfDate} by ${exposure} day(s) and ` +
            `no forecast connection date is set. Exposure is measured against the as-of date until a forecast is committed.`,
          recommendation:
            'Obtain a committed forecast connection date from the provider so exposure can be tracked against a real ' +
            'target; an open-ended utility item is an unquantified schedule risk.',
          refs: { businessKey: c.businessKey, requiredByDate: c.requiredByDate, delayExposureDays: exposure },
        });
      }

      // 3) Stuck not_started near required-by.
      if (c.status === 'not_started' && c.requiredByDate) {
        const days = daysBetween(asOf, parseDate(c.requiredByDate));
        if (days <= UtilityGovernanceService.STUCK_WINDOW_DAYS) {
          findings.push({
            type: 'stuck-not-started',
            severity: days <= 0 ? 'critical' : 'warning',
            title: `Not started with ${days}d to required-by — ${label}`,
            description:
              `The ${utilityTypeName(c.utilityType)} connection is still "not started" with ${days} day(s) to the ` +
              `required-by date ${c.requiredByDate}. Provider lead times typically exceed this window.`,
            recommendation:
              'Lodge the connection application immediately and confirm the provider lead time; not starting inside ' +
              `the ${UtilityGovernanceService.STUCK_WINDOW_DAYS}-day window almost guarantees a late connection.`,
            refs: { businessKey: c.businessKey, requiredByDate: c.requiredByDate, daysToRequiredBy: days },
          });
        }
      }

      // 4) Forecast missing on an in-flight connection (informational quality signal).
      if (!isConnected && c.status !== 'not_started' && !c.forecastConnectionDate) {
        findings.push({
          type: 'forecast-missing',
          severity: 'info',
          title: `No forecast connection date — ${label}`,
          description:
            `The connection is "${statusName(c.status)}" but carries no forecast connection date, so its delay ` +
            `exposure cannot be tracked against a committed target.`,
          recommendation:
            'Capture the provider’s forecast energization/connection date to close the readiness picture.',
          refs: { businessKey: c.businessKey, status: c.status },
        });
      }

      // 5) Connection ready (informational positive signal).
      if (isConnected) {
        findings.push({
          type: 'connection-ready',
          severity: 'info',
          title: `Connected — ${label}`,
          description:
            `The ${utilityTypeName(c.utilityType)} connection is live/connected and carries no delay exposure.`,
          recommendation:
            'Confirm metering/commissioning records are filed and the connection is reflected in the handover dossier.',
          refs: { businessKey: c.businessKey, status: c.status },
        });
      }
    }

    findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
    this.logger.log(`Utility validation for ${projectKey} (asOf ${asOfDate}): ${findings.length} finding(s) across ${connections.length} connection(s).`);
    return { projectKey, asOfDate, findings, connectionsChecked: connections.length };
  }

  /**
   * Utility Readiness Index (0..100) + status. The index is the mean per-status
   * progress weight across all connections (not_started 0 … connected 1), mapped
   * to 0..100. Status thresholds: >=80 green, >=60 yellow, >=40 orange, else red.
   * With no connections the position is "green" (nothing to connect = nothing at
   * risk), with an explicit narrative. Also returns the forecast-connection-date
   * list with per-connection delay exposure.
   */
  async utilityScore(projectKey: string, asOfDate = '2026-06-12'): Promise<UtilityScoreResult> {
    const connections = await this.utility.list(projectKey);
    const asOf = parseDate(asOfDate);

    if (connections.length === 0) {
      return {
        projectKey, asOfDate, score: 100, status: 'green', connections: 0,
        totals: { connected: 0, inFlight: 0, notStarted: 0, atRisk: 0, maxDelayExposureDays: 0, totalDelayExposureDays: 0 },
        forecasts: [],
        narrative: 'No utility connections recorded — there is no utility readiness risk to govern yet. Add the project’s power/water/telecom/gas/sewerage/district-cooling connections to begin readiness and delay-exposure monitoring.',
      };
    }

    // ── Utility Readiness Index: mean per-status progress weight. ──
    const readiness = avg(connections.map((c) => this.progressOf(c.status)));
    const score = Math.round(clamp01(readiness) * 100);
    const status: UtilityScoreResult['status'] =
      score >= 80 ? 'green' : score >= 60 ? 'yellow' : score >= 40 ? 'orange' : 'red';

    // ── Forecast Connection Dates + per-connection delay exposure. ──
    const forecasts: ForecastDate[] = connections.map((c) => ({
      businessKey: c.businessKey,
      title: c.title,
      utilityType: c.utilityType,
      status: c.status,
      forecastConnectionDate: c.forecastConnectionDate,
      requiredByDate: c.requiredByDate,
      delayExposureDays: c.status === 'connected' ? 0 : this.delayExposureDays(c, asOf),
    }));

    const exposures = forecasts.map((f) => f.delayExposureDays);
    const totals = {
      connected: connections.filter((c) => c.status === 'connected').length,
      inFlight: connections.filter((c) => c.status !== 'connected' && c.status !== 'not_started').length,
      notStarted: connections.filter((c) => c.status === 'not_started').length,
      atRisk: forecasts.filter((f) => f.delayExposureDays > 0).length,
      maxDelayExposureDays: exposures.length ? Math.max(...exposures) : 0,
      totalDelayExposureDays: exposures.reduce((s, x) => s + x, 0),
    };

    const narrative = this.narrate(score, status, totals, connections.length);
    this.logger.log(`Utility readiness for ${projectKey} (asOf ${asOfDate}): ${score}/100 (${status}).`);
    return { projectKey, asOfDate, score, status, connections: connections.length, totals, forecasts, narrative };
  }

  // ── helpers ──

  private narrate(
    score: number,
    status: string,
    totals: UtilityScoreResult['totals'],
    connections: number,
  ): string {
    const band = status === 'green' ? 'ready' : status === 'yellow' ? 'watch' : status === 'orange' ? 'stressed' : 'critical';
    return (
      `Utility readiness ${score}/100 (${band}). ` +
      `${totals.connected}/${connections} connected, ${totals.inFlight} in flight, ${totals.notStarted} not started. ` +
      `${totals.atRisk} connection(s) carry delay exposure; ` +
      `max exposure ${totals.maxDelayExposureDays}d, total exposure ${totals.totalDelayExposureDays}d.`
    );
  }
}

const SEV_ORDER: Record<UtilityFinding['severity'], number> = { critical: 0, warning: 1, info: 2 };

// ── label helpers ──

function utilityTypeName(t: string): string {
  const map: Record<string, string> = {
    power: 'power', water: 'water', telecom: 'telecom', gas: 'gas',
    sewerage: 'sewerage', district_cooling: 'district cooling',
  };
  return map[t] ?? t;
}

function statusName(s: string): string {
  const map: Record<string, string> = {
    not_started: 'not started', applied: 'applied', in_progress: 'in progress',
    testing: 'testing', energized: 'energized', connected: 'connected',
  };
  return map[s] ?? s;
}

// ── numeric + date utilities (deterministic, total) ──

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
