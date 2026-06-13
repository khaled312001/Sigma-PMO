import { Injectable, Logger } from '@nestjs/common';

import { FireSafetyRecord } from '../canonical/entities/fire-safety-record.entity';
import { FireLifeSafetyService } from './fire-life-safety.service';

/** A single fire & life safety governance finding (NOT persisted — computed on demand). */
export interface FireSafetyFinding {
  type:
    | 'rejected-record'
    | 'outstanding-comments'
    | 'approval-overdue'
    | 'approval-at-risk'
    | 'fire-readiness';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation: string;
  /** References tying the finding back to its record + computed quantum. */
  refs: Record<string, unknown>;
}

/** One record's contribution to the Outstanding-Comments roll-up. */
export interface OutstandingCommentsRow {
  businessKey: string;
  title: string;
  recordType: string;
  status: string;
  openComments: number;
}

/** The nearest approval forecast + its overdue/at-risk flag vs asOf. */
export interface ApprovalForecast {
  businessKey: string | null;
  title: string | null;
  approvalForecastDate: string | null;
  daysToForecast: number | null;
  flag: 'overdue' | 'at-risk' | 'on-track' | 'none';
}

/** The composite fire-readiness result. */
export interface FireReadinessResult {
  projectKey: string;
  asOfDate: string;
  /** 0..100 composite. */
  score: number;
  status: 'green' | 'yellow' | 'orange' | 'red';
  components: {
    approvalRate: number;
    commentBurden: number;
    rejectionFreedom: number;
  };
  records: number;
  totals: {
    approved: number;
    rejected: number;
    openCommentRecords: number;
    outstandingComments: number;
  };
  outstandingComments: OutstandingCommentsRow[];
  approvalForecast: ApprovalForecast;
  narrative: string;
}

/**
 * FireLifeSafetyGovernanceService — the deterministic Fire & Life Safety
 * governance engine (Mr. Ayham, 2026-06-13 17-stage lifecycle scope). It reads
 * a project's fire-safety records and derives, from explicit named formulas,
 * the compliance signals — rejected records, outstanding authority comments,
 * overdue/at-risk approval forecasts (Civil Defence) — plus a 0..100 Fire
 * Readiness composite. Pure deterministic (every number from a named formula;
 * `asOfDate` is the only time input); the AI layer only narrates these later.
 * Findings are NOT persisted (they are computed on demand from record state).
 */
@Injectable()
export class FireLifeSafetyGovernanceService {
  private readonly logger = new Logger(FireLifeSafetyGovernanceService.name);

  /** A record with at least this many open comments is a critical comment burden. */
  private static readonly HIGH_OPEN_COMMENTS = 10;
  /** Approval is "at risk" once the forecast date is within this many days of asOf. */
  private static readonly AT_RISK_WINDOW_DAYS = 30;

  constructor(private readonly fireSafety: FireLifeSafetyService) {}

  /**
   * Validate the fire-safety position and return findings (not persisted). One
   * pass over every current record raising the deterministic compliance signals.
   * Pure — `asOfDate` is the only time input (defaults to the deterministic
   * platform date), so the result is reproducible.
   */
  async validate(projectKey: string, asOfDate = '2026-06-12'): Promise<{
    projectKey: string;
    asOfDate: string;
    findings: FireSafetyFinding[];
    recordsChecked: number;
  }> {
    const records = await this.fireSafety.list(projectKey);
    const asOf = parseDate(asOfDate);
    const findings: FireSafetyFinding[] = [];

    for (const r of records) {
      const label = `${r.businessKey} — ${r.title}`;
      const open = intOrZero(r.openComments);

      // 1) Rejected record — a hard compliance failure with the authority.
      if (r.status === 'rejected') {
        findings.push({
          type: 'rejected-record',
          severity: 'critical',
          title: `Authority rejection — ${label}`,
          description:
            `${recordTypeLabel(r.recordType)} was rejected by ${r.authority ?? 'the authority'}. ` +
            'The fire-strategy submission is non-compliant and blocks approval until resubmitted.',
          recommendation:
            'Close out every rejection comment, revise the fire strategy/drawings to the authority’s requirements, ' +
            'and resubmit; the milestone cannot progress while a rejection stands.',
          refs: { businessKey: r.businessKey, recordType: r.recordType, authority: r.authority, openComments: open },
        });
      }

      // 2) Outstanding comments on a non-approved record (warning, critical when high).
      if (r.status !== 'approved' && open > 0) {
        const high = open >= FireLifeSafetyGovernanceService.HIGH_OPEN_COMMENTS;
        findings.push({
          type: 'outstanding-comments',
          severity: high ? 'critical' : 'warning',
          title: `${open} open comment(s)${high ? ' (high)' : ''} — ${label}`,
          description:
            `${open} authority comment(s) remain open on ${recordTypeLabel(r.recordType)} ` +
            `(${r.authority ?? 'authority'}, status "${r.status}"). Open comments hold the approval.`,
          recommendation:
            'Assign and close each open comment with the fire engineer; track them to zero before the next ' +
            'authority resubmission to release the approval.',
          refs: { businessKey: r.businessKey, openComments: open, status: r.status },
        });
      }

      // 3) Approval forecast vs asOf: overdue (<0d) or at-risk (within window) while not approved.
      if (r.approvalForecastDate && r.status !== 'approved' && r.status !== 'rejected') {
        const forecast = parseDate(r.approvalForecastDate);
        const days = daysBetween(asOf, forecast);
        if (days < 0) {
          findings.push({
            type: 'approval-overdue',
            severity: 'critical',
            title: `Approval overdue by ${Math.abs(days)}d — ${label}`,
            description:
              `Forecast approval ${r.approvalForecastDate} has passed (${Math.abs(days)} day(s) overdue as of ${asOfDate}) ` +
              `with status "${r.status}". The ${r.authority ?? 'authority'} approval is late.`,
            recommendation:
              'Escalate with the authority liaison, re-baseline the approval-forecast date, and confirm the ' +
              'critical-path impact of the slipped Civil Defence approval.',
            refs: { businessKey: r.businessKey, approvalForecastDate: r.approvalForecastDate, daysOverdue: Math.abs(days) },
          });
        } else if (days <= FireLifeSafetyGovernanceService.AT_RISK_WINDOW_DAYS) {
          findings.push({
            type: 'approval-at-risk',
            severity: 'warning',
            title: `Approval at risk in ${days}d — ${label}`,
            description:
              `Forecast approval ${r.approvalForecastDate} is ${days} day(s) away (within the ` +
              `${FireLifeSafetyGovernanceService.AT_RISK_WINDOW_DAYS}-day window) while status is "${r.status}" with ${open} open comment(s).`,
            recommendation:
              'Front-load comment closure and confirm the authority review slot now so the approval lands on the ' +
              'forecast date and does not slip onto the critical path.',
            refs: { businessKey: r.businessKey, approvalForecastDate: r.approvalForecastDate, daysToForecast: days, openComments: open },
          });
        }
      }
    }

    findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
    this.logger.log(`Fire-safety validation for ${projectKey} (asOf ${asOfDate}): ${findings.length} finding(s) across ${records.length} record(s).`);
    return { projectKey, asOfDate, findings, recordsChecked: records.length };
  }

  /**
   * Fire-readiness composite (0..100) + status. Three deterministic components
   * averaged with explicit weights:
   *   - approvalRate (50%): approved / total records (the share of the fire
   *     strategy + authority pack that is signed off).
   *   - commentBurden (25%): 1 − min(1, Σ(openComments on non-approved) / (5 ×
   *     nonApprovedRecords)); fewer outstanding comments = higher.
   *   - rejectionFreedom (25%): 1 − rejected / total (no rejections = 1.0).
   * Status thresholds: >=80 green, >=60 yellow, >=40 orange, else red. With no
   * records the position is "green" (nothing submitted = nothing at risk), with
   * an explicit narrative.
   */
  async fireReadiness(projectKey: string, asOfDate = '2026-06-12'): Promise<FireReadinessResult> {
    const records = await this.fireSafety.list(projectKey);
    const asOf = parseDate(asOfDate);

    const totals = this.totals(records);
    const outstandingComments = this.outstandingComments(records);
    const approvalForecast = this.nearestApprovalForecast(records, asOf, asOfDate);

    if (records.length === 0) {
      return {
        projectKey, asOfDate, score: 100, status: 'green',
        components: { approvalRate: 1, commentBurden: 1, rejectionFreedom: 1 },
        records: 0, totals, outstandingComments, approvalForecast,
        narrative: 'No fire & life safety records yet — there is no fire-strategy compliance to govern. Add the fire strategy, drawings and Civil Defence submissions to begin approval and comment tracking.',
      };
    }

    // ── Component 1: approval rate (share of records approved). ──
    const approvalRate = totals.approved / records.length;

    // ── Component 2: comment burden across non-approved records. ──
    const nonApproved = records.filter((r) => r.status !== 'approved');
    const openOnNonApproved = nonApproved.reduce((s, r) => s + intOrZero(r.openComments), 0);
    // Saturates at 5 open comments per non-approved record (then burden = full).
    const commentCapacity = nonApproved.length * 5;
    const commentBurden = commentCapacity > 0
      ? clamp01(1 - openOnNonApproved / commentCapacity)
      : 1; // nothing non-approved → no burden.

    // ── Component 3: rejection freedom (no rejected records = 1.0). ──
    const rejectionFreedom = clamp01(1 - totals.rejected / records.length);

    const components = {
      approvalRate: round4(approvalRate),
      commentBurden: round4(commentBurden),
      rejectionFreedom: round4(rejectionFreedom),
    };
    const composite = 0.5 * approvalRate + 0.25 * commentBurden + 0.25 * rejectionFreedom;
    const score = Math.round(clamp01(composite) * 100);
    const status: FireReadinessResult['status'] =
      score >= 80 ? 'green' : score >= 60 ? 'yellow' : score >= 40 ? 'orange' : 'red';

    const narrative = this.narrate(score, status, components, totals, approvalForecast);
    this.logger.log(`Fire readiness for ${projectKey} (asOf ${asOfDate}): ${score}/100 (${status}).`);
    return { projectKey, asOfDate, score, status, components, records: records.length, totals, outstandingComments, approvalForecast, narrative };
  }

  // ── helpers ──

  private totals(records: FireSafetyRecord[]): FireReadinessResult['totals'] {
    let approved = 0;
    let rejected = 0;
    let openCommentRecords = 0;
    let outstandingComments = 0;
    for (const r of records) {
      if (r.status === 'approved') approved += 1;
      if (r.status === 'rejected') rejected += 1;
      const open = intOrZero(r.openComments);
      if (r.status !== 'approved' && open > 0) {
        openCommentRecords += 1;
        outstandingComments += open;
      }
    }
    return { approved, rejected, openCommentRecords, outstandingComments };
  }

  /** Outstanding-comments roll-up: every non-approved record with open comments, worst first. */
  private outstandingComments(records: FireSafetyRecord[]): OutstandingCommentsRow[] {
    return records
      .filter((r) => r.status !== 'approved' && intOrZero(r.openComments) > 0)
      .map((r) => ({
        businessKey: r.businessKey,
        title: r.title,
        recordType: r.recordType,
        status: r.status,
        openComments: intOrZero(r.openComments),
      }))
      .sort((a, b) => b.openComments - a.openComments);
  }

  /** Nearest approval forecast among non-approved records + its overdue/at-risk flag. */
  private nearestApprovalForecast(records: FireSafetyRecord[], asOf: Date, asOfDate: string): ApprovalForecast {
    const pending = records
      .filter((r) => r.approvalForecastDate && r.status !== 'approved' && r.status !== 'rejected')
      .map((r) => ({ r, days: daysBetween(asOf, parseDate(r.approvalForecastDate as string)) }))
      .sort((a, b) => a.days - b.days);

    if (pending.length === 0) {
      return { businessKey: null, title: null, approvalForecastDate: null, daysToForecast: null, flag: 'none' };
    }
    const { r, days } = pending[0];
    const flag: ApprovalForecast['flag'] =
      days < 0 ? 'overdue'
      : days <= FireLifeSafetyGovernanceService.AT_RISK_WINDOW_DAYS ? 'at-risk'
      : 'on-track';
    return {
      businessKey: r.businessKey,
      title: r.title,
      approvalForecastDate: r.approvalForecastDate,
      daysToForecast: days,
      flag,
    };
  }

  private narrate(
    score: number,
    status: string,
    c: FireReadinessResult['components'],
    totals: FireReadinessResult['totals'],
    forecast: ApprovalForecast,
  ): string {
    const band = status === 'green' ? 'ready' : status === 'yellow' ? 'watch' : status === 'orange' ? 'stressed' : 'critical';
    const fc = forecast.approvalForecastDate === null
      ? 'no pending approval forecast'
      : forecast.flag === 'overdue'
        ? `nearest approval overdue by ${Math.abs(forecast.daysToForecast as number)}d`
        : `nearest approval in ${forecast.daysToForecast}d (${forecast.flag})`;
    return (
      `Fire readiness ${score}/100 (${band}). ` +
      `Approval rate ${(c.approvalRate * 100).toFixed(0)}%, comment burden cleared ${(c.commentBurden * 100).toFixed(0)}%, ` +
      `rejection-free ${(c.rejectionFreedom * 100).toFixed(0)}%. ` +
      `Position: ${totals.approved} approved, ${totals.rejected} rejected, ${totals.outstandingComments} outstanding comment(s); ${fc}.`
    );
  }
}

const SEV_ORDER: Record<FireSafetyFinding['severity'], number> = { critical: 0, warning: 1, info: 2 };

// ── numeric + date utilities (deterministic, total) ──

const intOrZero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Parse an ISO date (YYYY-MM-DD) into a UTC Date; falls back to the platform date when unparseable. */
function parseDate(s: string): Date {
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? new Date('2026-06-12T00:00:00Z') : d;
}

/** Whole days from `a` to `b` (positive when b is later). */
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Human label for a record type (for finding text). */
function recordTypeLabel(t: string): string {
  const map: Record<string, string> = {
    fire_strategy: 'Fire strategy',
    fire_drawing: 'Fire drawing',
    civil_defense_review: 'Civil Defence review',
    testing_commissioning: 'Testing & commissioning',
    inspection: 'Inspection',
  };
  return map[t] ?? t;
}
