import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  Activity,
  Alert,
  BoQ,
  BoqItem,
  Claim,
  ClaimEvidenceLink,
  ClashItem,
  DecisionReview,
  DrawingPackage,
  GovernanceDecision,
  GovernanceStatusSnapshot,
  MonthlyReport,
  ProcurementPackage,
  Project,
  ProjectRecord,
} from '../canonical/entities';
import { SiteEvidence } from '../canonical/entities/site-evidence.entity';
import { EvidenceRoom } from '../evidence/evidence-room.entity';
import { companyScope } from '../../common/tenant/tenant-context';
import { ExecutiveKpiService, ExecutiveKpis } from '../executive/executive-kpi.service';

/** Read-only per-project governance dashboard (Mr. Ayham acceptance 2026-06-28). */
export interface GovernanceDashboard {
  projectKey: string;
  projectName: string | null;
  generatedAt: string;
  /** What fed the project (the source inputs). */
  sourceInputs: {
    drawings: number;
    bimModels: number;
    clashes: number;
    boqItems: number;
    procurementPackages: number;
    activities: number;
    siteEvidenceCaptures: number;
  };
  /** What the platform produced (the outputs). */
  outputs: {
    monthlyReports: number;
    kpis: ExecutiveKpis | null;
    governanceStatus: string | null;
  };
  /** The proof behind it (evidence). */
  evidence: {
    claims: number;
    evidenceRooms: number;
    siteEvidence: number;
    claimEvidenceLinks: number;
  };
  /** Who must act — nothing is auto-approved. */
  humanApproval: {
    decisionsTotal: number;
    approved: number;
    awaiting: number;
    note: string;
  };
  /** The latest recommendation — explicitly NOT acted on without a human. */
  recommendedDecision: {
    status: string | null;
    score: number | null;
    computedAt: string | null;
    source: 'governance-status-snapshot' | 'governance-decision' | 'none';
    summary: string | null;
    requiresHumanApproval: true;
  };
}

/**
 * GovernanceDashboardService — a strictly READ-ONLY aggregation of one project's
 * governance position (Mr. Ayham acceptance 2026-06-28): the source inputs that
 * fed it, the outputs produced, the evidence behind them, what is still pending
 * a human, and the latest recommended decision — with `requiresHumanApproval`
 * always true. No writes, no auto-approval: the platform recommends, a human
 * decides.
 */
@Injectable()
export class GovernanceDashboardService {
  private readonly logger = new Logger(GovernanceDashboardService.name);

  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(DrawingPackage) private readonly drawings: Repository<DrawingPackage>,
    @InjectRepository(ProjectRecord) private readonly records: Repository<ProjectRecord>,
    @InjectRepository(ClashItem) private readonly clashItems: Repository<ClashItem>,
    @InjectRepository(BoQ) private readonly boqs: Repository<BoQ>,
    @InjectRepository(BoqItem) private readonly boqItems: Repository<BoqItem>,
    @InjectRepository(ProcurementPackage) private readonly procurement: Repository<ProcurementPackage>,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
    @InjectRepository(SiteEvidence) private readonly siteEvidence: Repository<SiteEvidence>,
    @InjectRepository(MonthlyReport) private readonly reports: Repository<MonthlyReport>,
    @InjectRepository(Claim) private readonly claims: Repository<Claim>,
    @InjectRepository(EvidenceRoom) private readonly evidenceRooms: Repository<EvidenceRoom>,
    @InjectRepository(ClaimEvidenceLink) private readonly evidenceLinks: Repository<ClaimEvidenceLink>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(GovernanceDecision) private readonly decisions: Repository<GovernanceDecision>,
    @InjectRepository(DecisionReview) private readonly reviews: Repository<DecisionReview>,
    @InjectRepository(GovernanceStatusSnapshot) private readonly snapshots: Repository<GovernanceStatusSnapshot>,
    private readonly kpis: ExecutiveKpiService,
  ) {}

  async build(projectKey: string): Promise<GovernanceDashboard> {
    if (!projectKey?.trim()) throw new BadRequestException('projectKey is required');
    const project = await this.projects.findOne({
      where: { businessKey: projectKey, isCurrent: true, ...companyScope() },
    });
    if (!project) throw new NotFoundException(`No current project "${projectKey}"`);

    // ── Source inputs ──────────────────────────────────────────────────────
    const drawings = await this.drawings.count({ where: { projectBusinessKey: projectKey } });
    const bimModels = await this.records.count({ where: { projectBusinessKey: projectKey, recordType: 'bim-model', isCurrent: true } });
    const clashes = await this.clashItems.count({ where: { projectBusinessKey: projectKey } });
    const currentBoqs = await this.boqs.find({ where: { businessKey: `boq:${projectKey}`, isCurrent: true } });
    const boqItems = currentBoqs.length
      ? await this.boqItems.count({ where: { boqId: In(currentBoqs.map((b) => b.id)) } })
      : 0;
    const procurementPackages = await this.procurement.count({ where: { projectBusinessKey: projectKey, isCurrent: true } });
    const activities = await this.activities.count({ where: { projectId: project.id, isCurrent: true } });
    const siteEvidence = await this.siteEvidence.count({ where: { projectBusinessKey: projectKey, ...companyScope() } });

    // ── Outputs ────────────────────────────────────────────────────────────
    const monthlyReports = await this.reports.count({ where: { projectBusinessKey: projectKey } });
    let kpis: ExecutiveKpis | null = null;
    try { kpis = await this.kpis.computeKpis(projectKey); } catch { kpis = null; }
    const latestSnapshot = await this.snapshots.findOne({
      where: { nodeType: 'project', nodeBusinessKey: projectKey },
      order: { computedAt: 'DESC' },
    });

    // ── Evidence ───────────────────────────────────────────────────────────
    const claimRows = await this.claims.find({ where: { projectBusinessKey: projectKey } });
    const evidenceRooms = await this.evidenceRooms.count({ where: { projectBusinessKey: projectKey } });
    const claimEvidenceLinks = claimRows.length
      ? await this.evidenceLinks.count({ where: { claimId: In(claimRows.map((c) => c.id)) } })
      : 0;

    // ── Human approval (decisions reach a project through its alerts) ───────
    const projectAlerts = await this.alerts.find({ where: { projectId: project.id } });
    const alertIds = projectAlerts.map((a) => a.id);
    const decisions = alertIds.length
      ? await this.decisions.find({ where: { alertId: In(alertIds) } })
      : [];
    const decisionIds = decisions.map((d) => d.id);
    const approveReviews = decisionIds.length
      ? await this.reviews.find({ where: { decisionId: In(decisionIds), action: 'approve' } })
      : [];
    const approvedDecisionIds = new Set(approveReviews.map((r) => r.decisionId));
    const approved = decisions.filter((d) => approvedDecisionIds.has(d.id)).length;
    const decisionsTotal = decisions.length;
    const awaiting = decisionsTotal - approved;

    // ── Recommended decision (latest) — never auto-approved ────────────────
    let recSource: GovernanceDashboard['recommendedDecision']['source'] = 'none';
    let recStatus: string | null = null;
    let recScore: number | null = null;
    let recComputedAt: string | null = null;
    let recSummary: string | null = null;
    if (latestSnapshot) {
      recSource = 'governance-status-snapshot';
      recStatus = latestSnapshot.status;
      recScore = latestSnapshot.score;
      recComputedAt = latestSnapshot.computedAt.toISOString();
      recSummary = `Latest computed governance status is ${latestSnapshot.status}. This is a recommendation only — a human must approve any resulting action.`;
    } else if (decisions.length) {
      const latest = decisions[decisions.length - 1];
      recSource = 'governance-decision';
      recStatus = latest.escalationLevel;
      recComputedAt = latest.createdAt?.toISOString() ?? null;
      recSummary = `Latest governance decision recommends: ${latest.rationale}. Responsible party: ${latest.responsibleParty}. A human must approve any resulting action.`;
    }

    this.logger.log(
      `Governance dashboard for ${projectKey}: ${decisionsTotal} decision(s) (${approved} approved, ${awaiting} awaiting human), ` +
      `status ${recStatus ?? 'n/a'}.`,
    );

    return {
      projectKey,
      projectName: project.name ?? null,
      generatedAt: new Date().toISOString(),
      sourceInputs: { drawings, bimModels, clashes, boqItems, procurementPackages, activities, siteEvidenceCaptures: siteEvidence },
      outputs: { monthlyReports, kpis, governanceStatus: latestSnapshot?.status ?? kpis?.governanceStatus ?? null },
      evidence: { claims: claimRows.length, evidenceRooms, siteEvidence, claimEvidenceLinks },
      humanApproval: {
        decisionsTotal, approved, awaiting,
        note: 'Nothing is auto-approved: every governance decision awaits an explicit human approval (recorded in decision_review).',
      },
      recommendedDecision: {
        status: recStatus, score: recScore, computedAt: recComputedAt, source: recSource,
        summary: recSummary, requiresHumanApproval: true,
      },
    };
  }
}
