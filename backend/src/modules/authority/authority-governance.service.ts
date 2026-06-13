import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Activity } from '../canonical/entities/activity.entity';
import { Project } from '../canonical/entities/project.entity';
import { AuthoritySubmission } from '../canonical/entities/authority-submission.entity';
import { AuthorityService } from './authority.service';

/** A single authority governance finding (NOT persisted — authority owns the submission entity, not findings). */
export interface AuthorityFinding {
  type:
    | 'delay-exposure'
    | 'critical-path-impact'
    | 'outstanding-comments'
    | 'rejected-submission'
    | 'approval-pending';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation: string;
  /** References tying the finding back to its submission + computed quantum. */
  refs: Record<string, unknown>;
}

/** One submission's delay-exposure computation (audit trail for the score + findings). */
export interface DelayExposureRow {
  businessKey: string;
  title: string;
  authority: string;
  status: string;
  requiredByDate: string | null;
  forecastApprovalDate: string | null;
  /** max(0, daysBetween(requiredBy, forecast ?? asOf)). */
  delayExposureDays: number;
  affectedActivityKeys: string[];
  /** Affected activity businessKeys judged critical-path-relevant. */
  criticalActivityKeys: string[];
  criticalPathImpact: boolean;
}

/** The composite authority-readiness result. */
export interface AuthorityScoreResult {
  projectKey: string;
  asOfDate: string;
  /** 0..100 composite (share approved, weighted by criticality). */
  score: number;
  status: 'green' | 'yellow' | 'orange' | 'red';
  submissions: number;
  /** Approval-status dashboard counts (output 2). */
  statusCounts: Record<string, number>;
  totals: {
    approved: number;
    rejected: number;
    pending: number;
    openComments: number;
    /** Sum of positive delay-exposure days across non-approved submissions. */
    totalDelayExposureDays: number;
    /** Count of submissions whose forecast slips a critical-path activity. */
    criticalPathImpacts: number;
  };
  /** Forecast approval dates list (output 4). */
  forecastApprovals: Array<{ businessKey: string; title: string; authority: string; forecastApprovalDate: string | null; requiredByDate: string | null }>;
  /** Per-submission delay-exposure detail (output 5 evidence). */
  delayExposure: DelayExposureRow[];
  narrative: string;
}

/**
 * AuthorityGovernanceService — the deterministic authority governance engine
 * (Mr. Ayham, 2026-06-13 — full 17-stage governance lifecycle). Reads a
 * project's authority submissions and derives, from explicit named formulas, the
 * authority risk signals: an Authority Readiness Score (share approved, weighted
 * by criticality), an approval-status dashboard, outstanding comments, the
 * forecast-approval list, and — the core — Escalation Alerts + Delay Exposure:
 * for each non-approved submission with a required-by date,
 *   delayExposureDays = max(0, daysBetween(requiredByDate, forecastApprovalDate ?? asOf)),
 * i.e. when the forecast approval slips past required-by, that gap is project
 * delay exposure (authority delay → not the contractor's fault), and when it
 * touches a critical-path activity (read from canonical Activity) it is a
 * critical-path impact feeding claims. Pure deterministic (every number from a
 * named formula); the AI layer only narrates these later. Findings are NOT
 * persisted — they are computed on demand from the submission state.
 */
@Injectable()
export class AuthorityGovernanceService {
  private readonly logger = new Logger(AuthorityGovernanceService.name);

  /** Criticality weight applied to a submission that gates a critical-path activity. */
  private static readonly CRITICAL_WEIGHT = 3;
  /** Criticality weight applied to a submission with affected (non-critical) activities. */
  private static readonly LINKED_WEIGHT = 2;
  /** Criticality weight applied to a submission with no schedule linkage. */
  private static readonly BASE_WEIGHT = 1;
  /**
   * Critical-path proxy: an affected activity is treated as schedule-driving
   * (critical) when it is not yet complete and its planned finish lies within
   * this many days of the project's latest planned finish (the completion date
   * it pushes). The canonical Activity model carries no float/logic, so this is
   * the explicit, named heuristic.
   */
  private static readonly CRITICAL_FINISH_WINDOW_DAYS = 14;

  constructor(
    private readonly authority: AuthorityService,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
  ) {}

  /**
   * Validate the authority position and return findings (not persisted). One
   * pass over every current submission raising the deterministic signals. Pure —
   * `asOfDate` is the only time input (defaults to the deterministic platform
   * date), so the result is reproducible.
   */
  async validate(projectKey: string, asOfDate = '2026-06-12'): Promise<{
    projectKey: string;
    asOfDate: string;
    findings: AuthorityFinding[];
    submissionsChecked: number;
  }> {
    const submissions = await this.authority.list(projectKey);
    const criticalKeys = await this.criticalActivityKeys(projectKey, asOfDate);
    const asOf = parseDate(asOfDate);
    const findings: AuthorityFinding[] = [];

    for (const s of submissions) {
      const label = `${s.businessKey} — ${s.title}`;
      const affected = s.affectedActivityKeys ?? [];
      const criticalHits = affected.filter((k) => criticalKeys.has(k));

      // 1) Delay exposure: non-approved submission whose forecast slips past required-by.
      if (s.status !== 'approved' && s.status !== 'rejected' && s.requiredByDate) {
        const requiredBy = parseDate(s.requiredByDate);
        const forecast = s.forecastApprovalDate ? parseDate(s.forecastApprovalDate) : asOf;
        const delayExposureDays = Math.max(0, daysBetween(requiredBy, forecast));
        if (delayExposureDays > 0) {
          const onCritical = criticalHits.length > 0;
          findings.push({
            type: onCritical ? 'critical-path-impact' : 'delay-exposure',
            severity: onCritical ? 'critical' : 'warning',
            title: onCritical
              ? `Critical-path delay exposure ${delayExposureDays}d — ${label}`
              : `Delay exposure ${delayExposureDays}d — ${label}`,
            description:
              `${authorityLabel(s.authority)} approval forecast ${s.forecastApprovalDate ?? `(none → as-of ${asOfDate})`} is ` +
              `${delayExposureDays} day(s) past the required-by date ${s.requiredByDate}. ` +
              (onCritical
                ? `It gates critical-path activity(ies) ${criticalHits.join(', ')}, so the slip flows straight to the project completion date — an authority-caused delay (not the contractor's fault) and a basis for an extension-of-time claim.`
                : `It gates ${affected.length ? `activity(ies) ${affected.join(', ')}` : 'no recorded activities'}; the slip is authority-caused delay exposure (not the contractor's fault).`),
            recommendation: onCritical
              ? 'Escalate to the authority liaison immediately; log the delay event with dates for an EOT/claim, and re-sequence the critical path around the approval.'
              : 'Expedite the authority follow-up and re-baseline the affected activities; record the delay event to preserve the claim position.',
            refs: { businessKey: s.businessKey, requiredByDate: s.requiredByDate, forecastApprovalDate: s.forecastApprovalDate, delayExposureDays, affectedActivityKeys: affected, criticalActivityKeys: criticalHits },
          });
        }
      }

      // 2) Outstanding comments on an open submission.
      if (s.openComments > 0 && s.status !== 'approved' && s.status !== 'rejected') {
        findings.push({
          type: 'outstanding-comments',
          severity: s.openComments >= 5 ? 'warning' : 'info',
          title: `${s.openComments} open comment(s) — ${label}`,
          description:
            `${authorityLabel(s.authority)} has ${s.openComments} outstanding comment(s) on this submission (status ${statusLabel(s.status)}). ` +
            `Each unresolved comment is a gate on the approval.`,
          recommendation:
            'Close out the authority comments with the design lead and resubmit; track each comment to closure to avoid a fresh review cycle.',
          refs: { businessKey: s.businessKey, openComments: s.openComments, status: s.status },
        });
      }

      // 3) Rejected submission — a hard stop on whatever it gates.
      if (s.status === 'rejected') {
        findings.push({
          type: 'rejected-submission',
          severity: criticalHits.length > 0 ? 'critical' : 'warning',
          title: `Submission rejected — ${label}`,
          description:
            `${authorityLabel(s.authority)} rejected this submission` +
            (affected.length ? `, blocking activity(ies) ${affected.join(', ')}${criticalHits.length ? ` (critical: ${criticalHits.join(', ')})` : ''}.` : '.'),
          recommendation:
            'Obtain the rejection grounds, remediate the design/documentation, and resubmit on an expedited track; assess the schedule and claim impact of the lost cycle.',
          refs: { businessKey: s.businessKey, affectedActivityKeys: affected, criticalActivityKeys: criticalHits },
        });
      }

      // 4) Approval pending with no forecast date — an un-forecastable gate (informational).
      if (s.status !== 'approved' && s.status !== 'rejected' && !s.forecastApprovalDate) {
        findings.push({
          type: 'approval-pending',
          severity: 'info',
          title: `No forecast approval date — ${label}`,
          description:
            `Submission is ${statusLabel(s.status)} with no forecast approval date, so its delay exposure cannot be projected forward.`,
          recommendation:
            'Set a forecast approval date with the authority liaison so delay exposure and critical-path impact can be tracked.',
          refs: { businessKey: s.businessKey, status: s.status },
        });
      }
    }

    findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
    this.logger.log(`Authority validation for ${projectKey} (asOf ${asOfDate}): ${findings.length} finding(s) across ${submissions.length} submission(s).`);
    return { projectKey, asOfDate, findings, submissionsChecked: submissions.length };
  }

  /**
   * Authority-readiness composite (0..100) + status, plus the dashboard
   * (status counts), forecast-approval list and per-submission delay-exposure
   * detail.
   *
   * Score = Σ(weightᵢ · approvedᵢ) / Σ(weightᵢ) · 100, where approvedᵢ ∈ {0,1}
   * and weightᵢ ∈ {CRITICAL_WEIGHT, LINKED_WEIGHT, BASE_WEIGHT} by the
   * submission's criticality (gates a critical-path activity / any activity /
   * none). Rejected submissions score 0 and carry their weight (they drag the
   * score down). This is "share approved, weighted by criticality".
   *
   * Status thresholds: >=80 green, >=60 yellow, >=40 orange, else red. With no
   * submissions the position is "green" (nothing submitted = nothing at risk).
   */
  async score(projectKey: string, asOfDate = '2026-06-12'): Promise<AuthorityScoreResult> {
    const submissions = await this.authority.list(projectKey);
    const criticalKeys = await this.criticalActivityKeys(projectKey, asOfDate);
    const asOf = parseDate(asOfDate);

    const statusCounts = this.statusCounts(submissions);
    const forecastApprovals = submissions.map((s) => ({
      businessKey: s.businessKey,
      title: s.title,
      authority: s.authority,
      forecastApprovalDate: s.forecastApprovalDate,
      requiredByDate: s.requiredByDate,
    }));

    if (submissions.length === 0) {
      return {
        projectKey, asOfDate, score: 100, status: 'green',
        submissions: 0, statusCounts,
        totals: { approved: 0, rejected: 0, pending: 0, openComments: 0, totalDelayExposureDays: 0, criticalPathImpacts: 0 },
        forecastApprovals: [],
        delayExposure: [],
        narrative: 'No authority submissions recorded — there is no authority/permit risk to govern yet. Add the project’s permit and NOC submissions to begin readiness, comment and delay-exposure monitoring.',
      };
    }

    // ── Weighted share-approved score + delay-exposure pass. ──
    let weightSum = 0;
    let approvedWeight = 0;
    let approved = 0;
    let rejected = 0;
    let pending = 0;
    let openComments = 0;
    let totalDelayExposureDays = 0;
    let criticalPathImpacts = 0;
    const delayExposure: DelayExposureRow[] = [];

    for (const s of submissions) {
      const affected = s.affectedActivityKeys ?? [];
      const criticalHits = affected.filter((k) => criticalKeys.has(k));
      const weight = criticalHits.length > 0
        ? AuthorityGovernanceService.CRITICAL_WEIGHT
        : affected.length > 0
          ? AuthorityGovernanceService.LINKED_WEIGHT
          : AuthorityGovernanceService.BASE_WEIGHT;
      weightSum += weight;
      if (s.status === 'approved') { approvedWeight += weight; approved += 1; }
      else if (s.status === 'rejected') { rejected += 1; }
      else { pending += 1; }
      openComments += s.openComments;

      // Delay exposure for every non-approved/non-rejected submission with a required-by.
      let delayExposureDays = 0;
      if (s.status !== 'approved' && s.status !== 'rejected' && s.requiredByDate) {
        const requiredBy = parseDate(s.requiredByDate);
        const forecast = s.forecastApprovalDate ? parseDate(s.forecastApprovalDate) : asOf;
        delayExposureDays = Math.max(0, daysBetween(requiredBy, forecast));
      }
      totalDelayExposureDays += delayExposureDays;
      const criticalPathImpact = delayExposureDays > 0 && criticalHits.length > 0;
      if (criticalPathImpact) criticalPathImpacts += 1;

      delayExposure.push({
        businessKey: s.businessKey,
        title: s.title,
        authority: s.authority,
        status: s.status,
        requiredByDate: s.requiredByDate,
        forecastApprovalDate: s.forecastApprovalDate,
        delayExposureDays,
        affectedActivityKeys: affected,
        criticalActivityKeys: criticalHits,
        criticalPathImpact,
      });
    }

    const ratio = weightSum > 0 ? approvedWeight / weightSum : 1;
    const score = Math.round(clamp01(ratio) * 100);
    const status: AuthorityScoreResult['status'] =
      score >= 80 ? 'green' : score >= 60 ? 'yellow' : score >= 40 ? 'orange' : 'red';

    delayExposure.sort((a, b) => b.delayExposureDays - a.delayExposureDays);
    const totals = {
      approved,
      rejected,
      pending,
      openComments,
      totalDelayExposureDays,
      criticalPathImpacts,
    };
    const narrative = this.narrate(score, status, totals, submissions.length);
    this.logger.log(`Authority readiness for ${projectKey} (asOf ${asOfDate}): ${score}/100 (${status}), ${totalDelayExposureDays}d delay exposure, ${criticalPathImpacts} critical-path impact(s).`);
    return { projectKey, asOfDate, score, status, submissions: submissions.length, statusCounts, totals, forecastApprovals, delayExposure, narrative };
  }

  // ── helpers ──

  private statusCounts(submissions: AuthoritySubmission[]): Record<string, number> {
    const counts: Record<string, number> = {
      draft: 0, submitted: 0, under_review: 0, comments: 0, approved: 0, rejected: 0,
    };
    for (const s of submissions) counts[s.status] = (counts[s.status] ?? 0) + 1;
    return counts;
  }

  /**
   * Critical-path activity businessKeys for a project: the deterministic
   * proxy = current, not-yet-complete activities whose plannedFinish lies within
   * CRITICAL_FINISH_WINDOW_DAYS of the project's latest plannedFinish (the
   * schedule-driving / completion-date-pushing tail). Empty set when the project
   * or its schedule is absent.
   */
  private async criticalActivityKeys(projectKey: string, asOfDate: string): Promise<Set<string>> {
    const project = await this.projects.findOne({ where: { businessKey: projectKey, isCurrent: true } });
    if (!project) return new Set<string>();
    const rows = await this.activities.find({ where: { projectId: project.id, isCurrent: true } });
    if (rows.length === 0) return new Set<string>();

    let latestFinish: number | null = null;
    for (const a of rows) {
      if (!a.plannedFinish) continue;
      const t = parseDate(a.plannedFinish).getTime();
      if (latestFinish === null || t > latestFinish) latestFinish = t;
    }
    if (latestFinish === null) return new Set<string>();

    const windowMs = AuthorityGovernanceService.CRITICAL_FINISH_WINDOW_DAYS * 86_400_000;
    const critical = new Set<string>();
    for (const a of rows) {
      if (!a.plannedFinish) continue;
      const complete = (a.actualPctComplete ?? 0) >= 1;
      if (complete) continue;
      const t = parseDate(a.plannedFinish).getTime();
      if (latestFinish - t <= windowMs) critical.add(a.businessKey);
    }
    return critical;
  }

  private narrate(
    score: number,
    status: string,
    totals: AuthorityScoreResult['totals'],
    submissions: number,
  ): string {
    const band = status === 'green' ? 'ready' : status === 'yellow' ? 'watch' : status === 'orange' ? 'stressed' : 'critical';
    const delay = totals.totalDelayExposureDays > 0
      ? `${totals.totalDelayExposureDays}d total delay exposure${totals.criticalPathImpacts > 0 ? ` (${totals.criticalPathImpacts} on the critical path)` : ''}`
      : 'no delay exposure';
    return (
      `Authority readiness ${score}/100 (${band}). ` +
      `${totals.approved} of ${submissions} approved, ${totals.pending} pending, ${totals.rejected} rejected; ` +
      `${totals.openComments} open comment(s); ${delay}.`
    );
  }
}

// ── label maps ──

function authorityLabel(a: string): string {
  const map: Record<string, string> = {
    municipality: 'Municipality',
    civil_defense: 'Civil Defence',
    electricity: 'Electricity authority',
    water: 'Water authority',
    telecom: 'Telecom authority',
    environmental: 'Environmental authority',
    rta: 'RTA',
    health: 'Health authority',
    other: 'Authority',
  };
  return map[a] ?? 'Authority';
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    draft: 'draft',
    submitted: 'submitted',
    under_review: 'under review',
    comments: 'in comments',
    approved: 'approved',
    rejected: 'rejected',
  };
  return map[s] ?? s;
}

const SEV_ORDER: Record<AuthorityFinding['severity'], number> = { critical: 0, warning: 1, info: 2 };

// ── date utilities (deterministic, total) ──

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
