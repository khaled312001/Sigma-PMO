import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Activity, Project } from '../canonical/entities';
import { QualityRecord } from '../canonical/entities/quality-record.entity';
import { QualityService } from './quality.service';

export interface QualityFinding {
  type:
    | 'open-ncr'
    | 'failed-inspection'
    | 'overdue-ncr'
    | 'uncleared-hold-point'
    | 'open-witness-point'
    | 'missing-itp'
    | 'reinspection-pending'
    | 'closure-evidence-missing';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation: string;
  refs: Record<string, unknown>;
}

/**
 * The claim chain a blocking NCR produces:
 *   NCR -> Rework/Repair -> Delay (eotDays) + Cost (costImpact) ->
 *   Critical Path impact -> EOT/Cost indicator -> Claim readiness.
 */
export interface NcrClaimChain {
  recordKey: string;
  title: string;
  recordDate: string | null;
  disposition: string | null;
  affectedActivityKeys: string[];
  criticalActivityKeys: string[];
  criticalPathImpact: boolean;
  eotDays: number;
  costImpact: number;
  eotIndicator: boolean;
  costIndicator: boolean;
  claimReady: boolean;
}

export interface QualityHealthResult {
  projectKey: string;
  asOfDate: string;
  /** 0..100 quality compliance composite. */
  complianceScore: number;
  /** First-pass inspection acceptance rate (0..100). */
  firstPassRate: number;
  status: 'green' | 'yellow' | 'orange' | 'red';
  trend: 'improving' | 'stable' | 'worsening';
  records: number;
  counts: {
    open: number;
    inProgress: number;
    closed: number;
    openNcrs: number;
    openHighOrCritical: number;
    failedInspections: number;
    inspections: number;
    holdPointsOpen: number;
    itps: number;
    blockingNcrs: number;
  };
  openBySeverity: Record<string, number>;
  narrative: string;
}

/**
 * QualityGovernanceService — the deterministic QA/QC engine (Mr. Ayham
 * acceptance #4). From named formulas over the quality records it derives:
 * (1) a 0..100 Quality Compliance Score, (2) a first-pass inspection acceptance
 * rate, (3) the open-findings register (NCRs, failed inspections, uncleared
 * hold/witness points, missing ITPs, pending reinspections, missing closure
 * evidence), (4) the quality trend, and (5) NCR claim chains
 * (NCR -> Rework -> Delay + Cost -> Critical Path -> EOT/Cost -> Claim readiness),
 * reading canonical Activity to flag critical-path impact. Pure deterministic —
 * `asOfDate` is the only time input; any AI layer only narrates these figures.
 */
@Injectable()
export class QualityGovernanceService {
  private readonly logger = new Logger(QualityGovernanceService.name);

  private static readonly NCR_OVERDUE_DAYS = 30;

  constructor(
    private readonly quality: QualityService,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
  ) {}

  async validate(projectKey: string, asOfDate = '2026-06-20'): Promise<{
    projectKey: string;
    asOfDate: string;
    findings: QualityFinding[];
    claimChains: NcrClaimChain[];
    recordsChecked: number;
  }> {
    const records = await this.quality.list(projectKey);
    const criticalKeys = await this.criticalActivityKeys(projectKey);
    const asOf = parseDate(asOfDate);
    const findings: QualityFinding[] = [];
    const claimChains: NcrClaimChain[] = [];

    const hasItp = records.some((r) => r.recordType === 'itp');

    for (const r of records) {
      const label = `${r.businessKey} — ${r.title}`;
      const isOpen = r.status !== 'closed';
      const sev = r.severity ?? 'info';

      // 1) Open NCR.
      if (r.recordType === 'ncr' && isOpen) {
        findings.push({
          type: 'open-ncr',
          severity: sev === 'critical' || sev === 'high' ? 'critical' : 'warning',
          title: `Open NCR — ${label}`,
          description:
            `Non-conformance "${r.title}" (severity ${sev}) is ${r.status}` +
            `${r.disposition ? `, disposition ${r.disposition}` : ', no disposition yet'}. ` +
            `Open NCRs are unremediated quality failures that can drive rework, delay and cost.`,
          recommendation:
            'Decide the disposition (rework/repair/use-as-is/reject), execute the corrective action, ' +
            'and close the NCR against re-inspection and closure evidence.',
          refs: { businessKey: r.businessKey, severity: sev, status: r.status, disposition: r.disposition },
        });
      }

      // 2) Failed inspection still open (WIR/MIR/test).
      if (['inspection_request', 'material_inspection', 'test_report', 'itp'].includes(r.recordType) && r.inspectionResult === 'fail' && isOpen) {
        findings.push({
          type: 'failed-inspection',
          severity: 'critical',
          title: `Failed inspection — ${label}`,
          description:
            `Inspection/test "${r.title}" returned FAIL and remains ${r.status}. ` +
            `Rejected work must be re-worked and re-inspected before the activity can proceed or be valued.`,
          recommendation: 'Raise an NCR (if not already), re-work, then re-inspect and record the passing result as closure evidence.',
          refs: { businessKey: r.businessKey, inspectionResult: r.inspectionResult, status: r.status },
        });
      }

      // 3) Overdue open NCR.
      if (r.recordType === 'ncr' && isOpen && r.recordDate) {
        const age = daysBetween(parseDate(r.recordDate), asOf);
        if (age > QualityGovernanceService.NCR_OVERDUE_DAYS) {
          findings.push({
            type: 'overdue-ncr',
            severity: 'warning',
            title: `Overdue NCR (${age}d) — ${label}`,
            description: `NCR raised ${r.recordDate} is ${age} day(s) old and still ${r.status} (past the ${QualityGovernanceService.NCR_OVERDUE_DAYS}-day window from ${asOfDate}).`,
            recommendation: 'Escalate the NCR to disposition and closure; ageing NCRs accumulate rework risk and weaken the audit trail.',
            refs: { businessKey: r.businessKey, ageDays: age, recordDate: r.recordDate },
          });
        }
      }

      // 4) Uncleared hold point — blocks progress.
      if (r.holdPoint && isOpen) {
        findings.push({
          type: 'uncleared-hold-point',
          severity: 'warning',
          title: `Uncleared hold point — ${label}`,
          description: `"${r.title}" carries a HOLD point that is still ${r.status}. Work at the hold point must not proceed until it is inspected and signed off.`,
          recommendation: 'Inspect the hold point, record the result, and sign it off before releasing the next operation.',
          refs: { businessKey: r.businessKey, status: r.status },
        });
      }

      // 5) Open witness point.
      if (r.witnessPoint && isOpen) {
        findings.push({
          type: 'open-witness-point',
          severity: 'info',
          title: `Witness point to notify — ${label}`,
          description: `"${r.title}" carries a WITNESS point still ${r.status}. The witnessing party should be notified with adequate notice.`,
          recommendation: 'Issue the witness notification with the contractual notice period and record attendance.',
          refs: { businessKey: r.businessKey, status: r.status },
        });
      }

      // 6) Reinspection pending.
      if (r.reinspectionOf && isOpen) {
        findings.push({
          type: 'reinspection-pending',
          severity: 'info',
          title: `Reinspection pending — ${label}`,
          description: `"${r.title}" re-tests ${r.reinspectionOf} and is still ${r.status}.`,
          recommendation: 'Complete the reinspection and record pass/fail to close the loop on the original failure.',
          refs: { businessKey: r.businessKey, reinspectionOf: r.reinspectionOf },
        });
      }

      // 7) Closed NCR without closure evidence.
      if (r.recordType === 'ncr' && r.status === 'closed') {
        const hasEvidence = !!r.details && Array.isArray((r.details as Record<string, unknown>)['closureEvidenceSourceFileIds'])
          && ((r.details as Record<string, unknown>)['closureEvidenceSourceFileIds'] as unknown[]).length > 0;
        if (!hasEvidence) {
          findings.push({
            type: 'closure-evidence-missing',
            severity: 'warning',
            title: `NCR closed without closure evidence — ${label}`,
            description: `NCR "${r.title}" is closed but no closure evidence (re-inspection/test record) is linked. A closed NCR without evidence is not defensible in a dispute.`,
            recommendation: 'Attach the re-inspection/test record (closureEvidenceSourceFileIds) that substantiates the closure.',
            refs: { businessKey: r.businessKey },
          });
        }
      }

      // 8) Blocking NCR -> claim chain.
      if (r.recordType === 'ncr' && r.blocksProgress) {
        const affected = Array.isArray(r.affectedActivityKeys) ? r.affectedActivityKeys : [];
        const criticalActivityKeys = affected.filter((k) => criticalKeys.has(k));
        const eotDays = typeof r.eotDays === 'number' && Number.isFinite(r.eotDays) ? r.eotDays : 0;
        const costImpact = r.costImpact ? Number.parseFloat(r.costImpact) : 0;
        const criticalPathImpact = criticalActivityKeys.length > 0;
        const eotIndicator = eotDays > 0;
        const costIndicator = costImpact > 0;
        const claimReady = (eotDays > 0 || costImpact > 0) && affected.length > 0;

        const chain: NcrClaimChain = {
          recordKey: r.businessKey,
          title: r.title,
          recordDate: r.recordDate,
          disposition: r.disposition,
          affectedActivityKeys: affected,
          criticalActivityKeys,
          criticalPathImpact,
          eotDays,
          costImpact,
          eotIndicator,
          costIndicator,
          claimReady,
        };
        claimChains.push(chain);

        findings.push({
          type: 'open-ncr',
          severity: criticalPathImpact ? 'critical' : 'warning',
          title: `Blocking NCR — ${label}`,
          description:
            `NCR "${r.title}" blocks ${affected.length} activity(ies)${affected.length ? ` [${affected.join(', ')}]` : ''}. ` +
            `Claim chain: NCR → ${r.disposition ?? 'rework'} → Delay ${eotDays}d + Cost ${costImpact} → ` +
            `${criticalPathImpact ? `critical-path impact on ${criticalActivityKeys.join(', ')}` : 'no critical-path impact'} → ` +
            `EOT ${eotIndicator ? 'claimable' : 'not indicated'} / Cost ${costIndicator ? 'claimable' : 'not indicated'} → claim ${claimReady ? 'READY' : 'not ready'}.`,
          recommendation: claimReady
            ? 'Where the non-conformance is the employer/consultant’s risk, lodge the EOT/cost notice with the NCR, the affected-activity list and the rework cost as evidence; where it is the contractor’s own defect, record the rework at the contractor’s cost.'
            : 'Quantify the rework EOT days and cost and confirm the affected activities so the NCR claim chain can be assessed.',
          refs: { businessKey: r.businessKey, affectedActivityKeys: affected, criticalActivityKeys, criticalPathImpact, eotDays, costImpact, claimReady },
        });
      }
    }

    // 9) Missing ITP — foundational governance gap.
    if (!hasItp && records.length > 0) {
      findings.push({
        type: 'missing-itp',
        severity: 'warning',
        title: 'No Inspection & Test Plan (ITP) on record',
        description: `Quality records exist for ${projectKey} but no ITP is present. Inspections, hold/witness points and acceptance criteria should be governed against an approved ITP.`,
        recommendation: 'Record the approved ITP(s) so WIR/MIR/test activities, hold points and witness points are governed against explicit acceptance criteria.',
        refs: { projectKey },
      });
    }

    findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
    this.logger.log(`Quality validation for ${projectKey} (asOf ${asOfDate}): ${findings.length} finding(s), ${claimChains.length} NCR claim chain(s) across ${records.length} record(s).`);
    return { projectKey, asOfDate, findings, claimChains, recordsChecked: records.length };
  }

  /**
   * Quality-health composite.
   * (1) Quality Compliance Score — starts at 100, dragged/lifted by explicit
   *     penalties/credits: −16 per open critical/high NCR, −6 per open medium NCR,
   *     −10 per failed inspection, −5 per blocking NCR, −4 per uncleared hold point;
   *     +3 per passed inspection (cap +18), +2 per ITP (cap +12), +2 per closed NCR (cap +12).
   * (2) First-pass rate — passed inspections / total inspections·100.
   * Status: ≥80 green, ≥60 yellow, ≥40 orange, else red. Any blocking NCR on the
   * critical path, or any open critical NCR, forces at least ORANGE.
   */
  async qualityHealth(projectKey: string, asOfDate = '2026-06-20'): Promise<QualityHealthResult> {
    const records = await this.quality.list(projectKey);
    const criticalKeys = await this.criticalActivityKeys(projectKey);
    const counts = this.counts(records);
    const openBySeverity = this.openBySeverity(records);

    if (records.length === 0) {
      return {
        projectKey, asOfDate,
        complianceScore: 100, firstPassRate: 100, status: 'green', trend: 'stable',
        records: 0, counts, openBySeverity,
        narrative: 'No quality records yet — nothing to govern against the ITP. Record ITPs, inspection requests (WIR/MIR), test reports and any NCRs to begin QA/QC Governance.',
      };
    }

    let score = 100;
    let openHighNcr = 0, openMedNcr = 0, failedInsp = 0, blockingNcr = 0, holdOpen = 0;
    let passedInsp = 0, itps = 0, closedNcr = 0, totalInsp = 0;
    for (const r of records) {
      const isOpen = r.status !== 'closed';
      const sev = r.severity ?? 'info';
      if (r.recordType === 'ncr' && isOpen && (sev === 'critical' || sev === 'high')) openHighNcr += 1;
      if (r.recordType === 'ncr' && isOpen && sev === 'medium') openMedNcr += 1;
      if (r.recordType === 'ncr' && !isOpen) closedNcr += 1;
      if (r.recordType === 'ncr' && r.blocksProgress && isOpen) blockingNcr += 1;
      if (['inspection_request', 'material_inspection', 'test_report'].includes(r.recordType)) {
        totalInsp += 1;
        if (r.inspectionResult === 'pass') passedInsp += 1;
        if (r.inspectionResult === 'fail' && isOpen) failedInsp += 1;
      }
      if (r.recordType === 'itp') itps += 1;
      if (r.holdPoint && isOpen) holdOpen += 1;
    }
    score -= 16 * openHighNcr;
    score -= 6 * openMedNcr;
    score -= 10 * failedInsp;
    score -= 5 * blockingNcr;
    score -= 4 * holdOpen;
    score += Math.min(18, 3 * passedInsp);
    score += Math.min(12, 2 * itps);
    score += Math.min(12, 2 * closedNcr);
    const complianceScore = Math.round(clamp(score, 0, 100));
    const firstPassRate = totalInsp > 0 ? Math.round((passedInsp / totalInsp) * 100) : 100;

    const blockingOnCritical = records.some(
      (r) => r.recordType === 'ncr' && r.blocksProgress && r.status !== 'closed' &&
        Array.isArray(r.affectedActivityKeys) && r.affectedActivityKeys.some((k) => criticalKeys.has(k)),
    );
    const openCriticalNcr = records.some((r) => r.recordType === 'ncr' && r.status !== 'closed' && r.severity === 'critical');

    let status: QualityHealthResult['status'] =
      complianceScore >= 80 ? 'green' : complianceScore >= 60 ? 'yellow' : complianceScore >= 40 ? 'orange' : 'red';
    if ((blockingOnCritical || openCriticalNcr) && (status === 'green' || status === 'yellow')) status = 'orange';

    const trend = this.trend(records);
    const narrative =
      `Quality governance ${status === 'green' ? 'healthy' : status === 'yellow' ? 'watch' : status === 'orange' ? 'stressed' : 'critical'}: ` +
      `compliance ${complianceScore}/100, first-pass acceptance ${firstPassRate}%, trend ${trend}. ` +
      `${counts.openNcrs} open NCR(s) (${counts.openHighOrCritical} high/critical), ${counts.blockingNcrs} blocking, ` +
      `${counts.failedInspections} failed inspection(s), ${counts.inspections} inspection(s), ${counts.itps} ITP(s).`;
    this.logger.log(`Quality health for ${projectKey} (asOf ${asOfDate}): compliance ${complianceScore}/100, first-pass ${firstPassRate}% (${status}, ${trend}).`);
    return { projectKey, asOfDate, complianceScore, firstPassRate, status, trend, records: records.length, counts, openBySeverity, narrative };
  }

  // ── helpers ──

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

  private counts(records: QualityRecord[]): QualityHealthResult['counts'] {
    const c = { open: 0, inProgress: 0, closed: 0, openNcrs: 0, openHighOrCritical: 0, failedInspections: 0, inspections: 0, holdPointsOpen: 0, itps: 0, blockingNcrs: 0 };
    for (const r of records) {
      if (r.status === 'open') c.open += 1;
      else if (r.status === 'in_progress') c.inProgress += 1;
      else if (r.status === 'closed') c.closed += 1;
      const isOpen = r.status !== 'closed';
      const sev = r.severity ?? 'info';
      if (r.recordType === 'ncr' && isOpen) c.openNcrs += 1;
      if (isOpen && (sev === 'high' || sev === 'critical')) c.openHighOrCritical += 1;
      if (['inspection_request', 'material_inspection', 'test_report'].includes(r.recordType)) c.inspections += 1;
      if (r.inspectionResult === 'fail' && isOpen) c.failedInspections += 1;
      if (r.holdPoint && isOpen) c.holdPointsOpen += 1;
      if (r.recordType === 'itp') c.itps += 1;
      if (r.recordType === 'ncr' && r.blocksProgress && isOpen) c.blockingNcrs += 1;
    }
    return c;
  }

  private openBySeverity(records: QualityRecord[]): Record<string, number> {
    const out: Record<string, number> = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
    for (const r of records) {
      if (r.status === 'closed') continue;
      const sev = r.severity ?? 'info';
      out[sev] = (out[sev] ?? 0) + 1;
    }
    return out;
  }

  private trend(records: QualityRecord[]): QualityHealthResult['trend'] {
    let openNcr = 0, closedNcr = 0, blocking = 0;
    for (const r of records) {
      if (r.recordType === 'ncr') {
        if (r.status === 'closed') closedNcr += 1; else openNcr += 1;
      }
      if (r.recordType === 'ncr' && r.blocksProgress && r.status !== 'closed') blocking += 1;
    }
    if (openNcr > closedNcr || blocking > 0) return 'worsening';
    if (closedNcr > openNcr && blocking === 0) return 'improving';
    return 'stable';
  }
}

const SEV_ORDER: Record<QualityFinding['severity'], number> = { critical: 0, warning: 1, info: 2 };

function isCritical(a: Activity): boolean {
  const status = (a.status ?? '').toLowerCase();
  const type = (a.activityType ?? '').toLowerCase();
  return status.includes('critical') || type.includes('critical');
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

function parseDate(s: string): Date {
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? new Date('2026-06-20T00:00:00Z') : d;
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
