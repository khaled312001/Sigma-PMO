import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Activity, Project } from '../canonical/entities';
import { SafetyRecord } from '../canonical/entities/safety-record.entity';
import { SafetyService } from './safety.service';

/** A single safety governance finding (NOT persisted as a finding — derived). */
export interface SafetyFinding {
  type:
    | 'open-incident'
    | 'open-corrective-action'
    | 'overdue-inspection'
    | 'stop-work'
    | 'missing-hse-plan'
    | 'near-miss-signal';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation: string;
  /** References tying the finding back to its record + computed quantum. */
  refs: Record<string, unknown>;
}

/**
 * The claim chain a stop-work safety event produces:
 *   Safety Event -> Stop Work -> Delay (eotDays) -> Critical Path impact ->
 *   EOT indicator -> Claim readiness.
 */
export interface StopWorkClaimChain {
  recordKey: string;
  title: string;
  recordDate: string | null;
  affectedActivityKeys: string[];
  /** Subset of affectedActivityKeys that map to an isCritical canonical Activity. */
  criticalActivityKeys: string[];
  /** True when any affected activity sits on the critical path. */
  criticalPathImpact: boolean;
  eotDays: number;
  /** Extension-of-time is claimable on the calendar. */
  eotIndicator: boolean;
  /** Ready when eotDays > 0 AND there is at least one affected activity. */
  claimReady: boolean;
}

/** The composite safety-health result. */
export interface SafetyHealthResult {
  projectKey: string;
  asOfDate: string;
  /** 0..100 safety compliance composite. */
  complianceScore: number;
  /** 0..100 HSE performance index. */
  hsePerformanceIndex: number;
  status: 'green' | 'yellow' | 'orange' | 'red';
  /** Improving / stable / worsening from incident counts. */
  trend: 'improving' | 'stable' | 'worsening';
  records: number;
  counts: {
    open: number;
    inProgress: number;
    closed: number;
    openIncidents: number;
    openHighOrCritical: number;
    nearMisses: number;
    correctiveActionsClosed: number;
    inspections: number;
    toolboxTalks: number;
    stopWorkActive: number;
  };
  /** Open records bucketed by severity (the open-findings register). */
  openBySeverity: Record<string, number>;
  narrative: string;
}

/**
 * SafetyGovernanceService — the deterministic Safety Governance engine
 * (Mr. Ayham, 2026-06-13 full governance lifecycle). Governs implementation of
 * approved HSE plans during execution. From explicit named formulas over the
 * safety records it derives: (1) a 0..100 Safety Compliance Score and (2) a
 * 0..100 HSE Performance Index, (3) the open-findings register by severity,
 * (4) the Safety Risk Register (findings list), (5) the Safety Trend, and
 * (6) Stop-Work alerts with the full claim chain (Safety Event -> Stop Work ->
 * Delay -> Critical Path -> EOT -> Claim readiness), reading canonical Activity
 * to flag critical-path impact. Pure deterministic — `asOfDate` is the only
 * time input; the AI layer only narrates these figures.
 */
@Injectable()
export class SafetyGovernanceService {
  private readonly logger = new Logger(SafetyGovernanceService.name);

  /** An open inspection older than this many days from as-of is "overdue". */
  private static readonly INSPECTION_OVERDUE_DAYS = 30;

  constructor(
    private readonly safety: SafetyService,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
  ) {}

  /**
   * Validate the safety position and return findings (the Safety Risk Register).
   * One pass over every current record raising the deterministic signals. Pure —
   * `asOfDate` is the only time input, so the result is reproducible.
   */
  async validate(projectKey: string, asOfDate = '2026-06-12'): Promise<{
    projectKey: string;
    asOfDate: string;
    findings: SafetyFinding[];
    claimChains: StopWorkClaimChain[];
    recordsChecked: number;
  }> {
    const records = await this.safety.list(projectKey);
    const criticalKeys = await this.criticalActivityKeys(projectKey);
    const asOf = parseDate(asOfDate);
    const findings: SafetyFinding[] = [];
    const claimChains: StopWorkClaimChain[] = [];

    const hasHsePlan = records.some((r) => r.recordType === 'hse_plan');

    for (const r of records) {
      const label = `${r.businessKey} — ${r.title}`;
      const isOpen = r.status !== 'closed';
      const sev = r.severity ?? 'info';

      // 1) Open incident: an unresolved incident record.
      if (r.recordType === 'incident' && isOpen) {
        findings.push({
          type: 'open-incident',
          severity: sev === 'critical' || sev === 'high' ? 'critical' : 'warning',
          title: `Open safety incident — ${label}`,
          description:
            `Incident "${r.title}" (severity ${sev}) remains ${r.status}. ` +
            `Unclosed incidents indicate the HSE plan is not yet fully enforced on site.`,
          recommendation:
            'Complete the root-cause analysis, assign corrective actions with owners and due dates, ' +
            'and close the incident against the approved HSE plan.',
          refs: { businessKey: r.businessKey, severity: sev, status: r.status, recordDate: r.recordDate },
        });
      }

      // 2) Open corrective action: remediation not yet completed.
      if (r.recordType === 'corrective_action' && isOpen) {
        findings.push({
          type: 'open-corrective-action',
          severity: sev === 'critical' || sev === 'high' ? 'critical' : 'warning',
          title: `Open corrective action — ${label}`,
          description:
            `Corrective action "${r.title}" (severity ${sev}) is still ${r.status}. ` +
            `Open corrective actions are the unremediated gaps in HSE-plan implementation.`,
          recommendation:
            'Drive the corrective action to closure; verify the fix on site and record the close-out evidence.',
          refs: { businessKey: r.businessKey, severity: sev, status: r.status },
        });
      }

      // 3) Overdue inspection: open inspection older than the overdue window.
      if (r.recordType === 'inspection' && isOpen && r.recordDate) {
        const recDate = parseDate(r.recordDate);
        const age = daysBetween(recDate, asOf);
        if (age > SafetyGovernanceService.INSPECTION_OVERDUE_DAYS) {
          findings.push({
            type: 'overdue-inspection',
            severity: 'warning',
            title: `Overdue inspection (${age}d) — ${label}`,
            description:
              `Inspection raised ${r.recordDate} is ${age} day(s) old and still ${r.status} ` +
              `(overdue past the ${SafetyGovernanceService.INSPECTION_OVERDUE_DAYS}-day window from ${asOfDate}).`,
            recommendation:
              'Re-walk the area, close out or re-issue the inspection, and confirm the HSE controls are in place.',
            refs: { businessKey: r.businessKey, ageDays: age, recordDate: r.recordDate },
          });
        }
      }

      // 6) Stop-work alert + claim chain.
      if (r.stopWork) {
        const affected = Array.isArray(r.affectedActivityKeys) ? r.affectedActivityKeys : [];
        const criticalActivityKeys = affected.filter((k) => criticalKeys.has(k));
        const eotDays = typeof r.eotDays === 'number' && Number.isFinite(r.eotDays) ? r.eotDays : 0;
        const criticalPathImpact = criticalActivityKeys.length > 0;
        const eotIndicator = eotDays > 0;
        const claimReady = eotDays > 0 && affected.length > 0;

        const chain: StopWorkClaimChain = {
          recordKey: r.businessKey,
          title: r.title,
          recordDate: r.recordDate,
          affectedActivityKeys: affected,
          criticalActivityKeys,
          criticalPathImpact,
          eotDays,
          eotIndicator,
          claimReady,
        };
        claimChains.push(chain);

        // Stop-work with critical-path impact escalates to critical; otherwise warning.
        findings.push({
          type: 'stop-work',
          severity: criticalPathImpact ? 'critical' : 'warning',
          title: `Stop-work order — ${label}`,
          description:
            `Stop-work raised on "${r.title}" affecting ${affected.length} activity(ies)` +
            `${affected.length ? ` [${affected.join(', ')}]` : ''}. ` +
            `Claim chain: Safety Event → Stop Work → Delay ${eotDays}d → ` +
            `${criticalPathImpact ? `critical-path impact on ${criticalActivityKeys.join(', ')}` : 'no critical-path impact'} → ` +
            `EOT ${eotIndicator ? 'claimable' : 'not indicated'} → claim ${claimReady ? 'READY' : 'not ready'}.`,
          recommendation: claimReady
            ? 'Lodge the EOT/claim notice now: the stop-work delays affected activities with a quantified EOT; ' +
              'attach the safety event, affected-activity list and critical-path analysis as evidence.'
            : 'Quantify the EOT days and confirm the affected activities so the stop-work claim chain can be ' +
              'assessed for entitlement before the notice window closes.',
          refs: {
            businessKey: r.businessKey,
            affectedActivityKeys: affected,
            criticalActivityKeys,
            criticalPathImpact,
            eotDays,
            eotIndicator,
            claimReady,
          },
        });
      }

      // 5-signal) Near-miss reporting — a POSITIVE leading indicator, logged info.
      if (r.recordType === 'near_miss') {
        findings.push({
          type: 'near-miss-signal',
          severity: 'info',
          title: `Near-miss reported — ${label}`,
          description:
            `Near-miss "${r.title}" was reported (${r.status}). A healthy near-miss reporting culture is a ` +
            `positive leading indicator that the HSE plan is being actively applied before incidents occur.`,
          recommendation:
            'Share the near-miss learning in the next toolbox talk and confirm the control that prevented harm is standardised.',
          refs: { businessKey: r.businessKey, status: r.status },
        });
      }
    }

    // 5) Missing HSE plan — the foundational governance gap.
    if (!hasHsePlan && records.length > 0) {
      findings.push({
        type: 'missing-hse-plan',
        severity: 'warning',
        title: 'No approved HSE plan on record',
        description:
          `Safety records exist for ${projectKey} but no hse_plan record is present. Execution-stage safety ` +
          `governance assumes an approved HSE plan as its baseline; its absence leaves findings ungoverned.`,
        recommendation:
          'Record the approved HSE plan so daily/weekly reporting, inspections and corrective actions are ' +
          'governed against an explicit baseline.',
        refs: { projectKey },
      });
    }

    findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
    this.logger.log(`Safety validation for ${projectKey} (asOf ${asOfDate}): ${findings.length} finding(s), ${claimChains.length} stop-work chain(s) across ${records.length} record(s).`);
    return { projectKey, asOfDate, findings, claimChains, recordsChecked: records.length };
  }

  /**
   * Safety-health composite. Two deterministic 0..100 scores plus trend + status.
   *
   * (1) Safety Compliance Score — starts at 100 and is dragged/lifted by explicit
   *     penalties/credits over the records:
   *        −18 per open critical/high incident
   *        −8  per open corrective action
   *        −6  per active stop-work
   *        −5  per open medium incident
   *        +4  per closed corrective action (capped +20)
   *        +3  per inspection (capped +15)
   *        +2  per toolbox talk (capped +10)
   *     clamped to [0,100].
   *
   * (2) HSE Performance Index — a leading/lagging blend on [0,100]:
   *        base 70
   *        +2 per near-miss reported (capped +20)   ← positive reporting culture
   *        +1.5 per toolbox talk (capped +12)
   *        +1.5 per inspection (capped +12)
   *        −10 per OPEN incident (any severity)
   *        −6  per active stop-work
   *     clamped to [0,100].
   *
   * Status thresholds on the compliance score: >=80 green, >=60 yellow,
   * >=40 orange, else red. Any active stop-work with critical-path impact, or
   * any open critical incident, forces at least ORANGE.
   */
  async safetyHealth(projectKey: string, asOfDate = '2026-06-12'): Promise<SafetyHealthResult> {
    const records = await this.safety.list(projectKey);
    const criticalKeys = await this.criticalActivityKeys(projectKey);

    const counts = this.counts(records);
    const openBySeverity = this.openBySeverity(records);

    if (records.length === 0) {
      return {
        projectKey, asOfDate,
        complianceScore: 100, hsePerformanceIndex: 100, status: 'green', trend: 'stable',
        records: 0, counts, openBySeverity,
        narrative: 'No safety records yet — there is nothing to govern against the HSE plan. Record the approved HSE plan, daily reports, inspections and any incidents to begin Safety Governance.',
      };
    }

    // ── (1) Safety Compliance Score. ──
    let compliance = 100;
    let openHighIncidents = 0;
    let openMedIncidents = 0;
    let openCorrective = 0;
    let closedCorrective = 0;
    let inspections = 0;
    let toolbox = 0;
    let stopWorkActive = 0;
    for (const r of records) {
      const isOpen = r.status !== 'closed';
      const sev = r.severity ?? 'info';
      if (r.recordType === 'incident' && isOpen && (sev === 'critical' || sev === 'high')) openHighIncidents += 1;
      if (r.recordType === 'incident' && isOpen && sev === 'medium') openMedIncidents += 1;
      if (r.recordType === 'corrective_action' && isOpen) openCorrective += 1;
      if (r.recordType === 'corrective_action' && !isOpen) closedCorrective += 1;
      if (r.recordType === 'inspection') inspections += 1;
      if (r.recordType === 'toolbox_talk') toolbox += 1;
      if (r.stopWork && r.status !== 'closed') stopWorkActive += 1;
    }
    compliance -= 18 * openHighIncidents;
    compliance -= 5 * openMedIncidents;
    compliance -= 8 * openCorrective;
    compliance -= 6 * stopWorkActive;
    compliance += Math.min(20, 4 * closedCorrective);
    compliance += Math.min(15, 3 * inspections);
    compliance += Math.min(10, 2 * toolbox);
    const complianceScore = Math.round(clamp(compliance, 0, 100));

    // ── (2) HSE Performance Index. ──
    let hse = 70;
    hse += Math.min(20, 2 * counts.nearMisses);
    hse += Math.min(12, 1.5 * toolbox);
    hse += Math.min(12, 1.5 * inspections);
    hse -= 10 * counts.openIncidents;
    hse -= 6 * stopWorkActive;
    const hsePerformanceIndex = Math.round(clamp(hse, 0, 100));

    // Critical-path stop-work or open critical incident forces ORANGE floor.
    const stopWorkOnCritical = records.some(
      (r) => r.stopWork && r.status !== 'closed' &&
        Array.isArray(r.affectedActivityKeys) &&
        r.affectedActivityKeys.some((k) => criticalKeys.has(k)),
    );
    const openCriticalIncident = records.some(
      (r) => r.recordType === 'incident' && r.status !== 'closed' && r.severity === 'critical',
    );

    let status: SafetyHealthResult['status'] =
      complianceScore >= 80 ? 'green' : complianceScore >= 60 ? 'yellow' : complianceScore >= 40 ? 'orange' : 'red';
    if ((stopWorkOnCritical || openCriticalIncident) && (status === 'green' || status === 'yellow')) {
      status = 'orange';
    }

    const trend = this.trend(records);
    const narrative = this.narrate(complianceScore, hsePerformanceIndex, status, trend, counts);
    this.logger.log(`Safety health for ${projectKey} (asOf ${asOfDate}): compliance ${complianceScore}/100, HSE ${hsePerformanceIndex}/100 (${status}, ${trend}).`);
    return {
      projectKey, asOfDate,
      complianceScore, hsePerformanceIndex, status, trend,
      records: records.length, counts, openBySeverity, narrative,
    };
  }

  // ── helpers ──

  /**
   * The set of canonical Activity keys (businessKey + wbsCode) that are on the
   * critical path for the project. Reads the current Project then its Activities
   * (like predictive does) and flags isCritical via status/activityType markers.
   */
  private async criticalActivityKeys(projectKey: string): Promise<Set<string>> {
    const project = await this.projects.findOne({ where: { businessKey: projectKey, isCurrent: true } });
    if (!project) return new Set();
    const activities = await this.activities.find({ where: { projectId: project.id } });
    const keys = new Set<string>();
    for (const a of activities) {
      if (!isCritical(a)) continue;
      if (a.wbsCode) keys.add(a.wbsCode);
      if (a.name) keys.add(a.name);
    }
    return keys;
  }

  private counts(records: SafetyRecord[]): SafetyHealthResult['counts'] {
    const c = {
      open: 0, inProgress: 0, closed: 0,
      openIncidents: 0, openHighOrCritical: 0, nearMisses: 0,
      correctiveActionsClosed: 0, inspections: 0, toolboxTalks: 0, stopWorkActive: 0,
    };
    for (const r of records) {
      if (r.status === 'open') c.open += 1;
      else if (r.status === 'in_progress') c.inProgress += 1;
      else if (r.status === 'closed') c.closed += 1;
      const isOpen = r.status !== 'closed';
      const sev = r.severity ?? 'info';
      if (r.recordType === 'incident' && isOpen) c.openIncidents += 1;
      if (isOpen && (sev === 'high' || sev === 'critical')) c.openHighOrCritical += 1;
      if (r.recordType === 'near_miss') c.nearMisses += 1;
      if (r.recordType === 'corrective_action' && !isOpen) c.correctiveActionsClosed += 1;
      if (r.recordType === 'inspection') c.inspections += 1;
      if (r.recordType === 'toolbox_talk') c.toolboxTalks += 1;
      if (r.stopWork && isOpen) c.stopWorkActive += 1;
    }
    return c;
  }

  private openBySeverity(records: SafetyRecord[]): Record<string, number> {
    const out: Record<string, number> = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
    for (const r of records) {
      if (r.status === 'closed') continue;
      const sev = r.severity ?? 'info';
      out[sev] = (out[sev] ?? 0) + 1;
    }
    return out;
  }

  /**
   * Safety Trend from incident counts: closed-vs-open incident balance.
   *   improving  → more incidents closed than open AND no active stop-work
   *   worsening  → open incidents exceed closed, OR an active stop-work exists
   *   stable     → otherwise.
   */
  private trend(records: SafetyRecord[]): SafetyHealthResult['trend'] {
    let openInc = 0;
    let closedInc = 0;
    let activeStopWork = 0;
    for (const r of records) {
      if (r.recordType === 'incident') {
        if (r.status === 'closed') closedInc += 1; else openInc += 1;
      }
      if (r.stopWork && r.status !== 'closed') activeStopWork += 1;
    }
    if (openInc > closedInc || activeStopWork > 0) return 'worsening';
    if (closedInc > openInc && activeStopWork === 0) return 'improving';
    return 'stable';
  }

  private narrate(
    compliance: number,
    hse: number,
    status: string,
    trend: string,
    counts: SafetyHealthResult['counts'],
  ): string {
    const band = status === 'green' ? 'healthy' : status === 'yellow' ? 'watch' : status === 'orange' ? 'stressed' : 'critical';
    return (
      `Safety governance ${band}: compliance ${compliance}/100, HSE performance index ${hse}/100, trend ${trend}. ` +
      `${counts.openIncidents} open incident(s) (${counts.openHighOrCritical} high/critical), ` +
      `${counts.stopWorkActive} active stop-work(s), ${counts.nearMisses} near-miss(es) reported, ` +
      `${counts.inspections} inspection(s), ${counts.toolboxTalks} toolbox talk(s), ` +
      `${counts.correctiveActionsClosed} corrective action(s) closed.`
    );
  }
}

const SEV_ORDER: Record<SafetyFinding['severity'], number> = { critical: 0, warning: 1, info: 2 };

/** Critical-path heuristic over a canonical Activity (deterministic, total). */
function isCritical(a: Activity): boolean {
  const status = (a.status ?? '').toLowerCase();
  const type = (a.activityType ?? '').toLowerCase();
  if (status.includes('critical')) return true;
  if (type.includes('critical')) return true;
  // Zero/negative remaining float modelled via remainingDurationDays heuristic is
  // not available; fall back to explicit critical markers above.
  return false;
}

// ── numeric + date utilities (deterministic, total) ──

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Parse an ISO date (YYYY-MM-DD) into a UTC Date; falls back deterministically. */
function parseDate(s: string): Date {
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? new Date('2026-06-12T00:00:00Z') : d;
}

/** Whole days from `a` to `b` (positive when b is later). */
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
