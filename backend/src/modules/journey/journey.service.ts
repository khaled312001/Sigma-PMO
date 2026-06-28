import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  Activity,
  Alert,
  BoQ,
  Claim,
  ConceptDocument,
  DrawingPackage,
  FeasibilityAssessment,
  FeasibilityStudySection,
  GovernanceDecision,
  InvestmentOpportunity,
  Letter,
  LifecycleLedgerEntry,
  MonthlyReport,
  Project,
} from '../canonical/entities';
import { EvidenceRoom } from '../evidence/evidence-room.entity';
import { companyScope } from '../../common/tenant/tenant-context';

/** One leg of the cross-module journey, in lifecycle order. */
export interface JourneyLeg {
  /** Stable lifecycle key, e.g. `opportunity`, `feasibility`, `bim`, `boq`. */
  stage: string;
  label: string;
  /** Rows on this leg with their key fields + the shared journeyCorrelationId. */
  items: Array<Record<string, unknown>>;
}

export interface JourneyChain {
  projectKey: string;
  projectName: string | null;
  opportunityId: string | null;
  /** Distinct journeyCorrelationIds discovered across the chain (often empty today). */
  correlationIds: string[];
  legs: JourneyLeg[];
}

/**
 * JourneyService — assembles the cross-module journey (Mr. Ayham acceptance
 * 2026-06-28, "the one pipeline"): sketch → feasibility → BIM/drawings → BoQ →
 * schedule → contract → site-evidence → report → decision, in lifecycle order,
 * for one project businessKey. It resolves the Project (and its opportunityId),
 * gathers the investment half by opportunityId and the construction half by
 * projectBusinessKey, and returns each leg with its key fields and the shared
 * `journeyCorrelationId` where present. The correlation id is mostly null today
 * (the seed stamps it later) — the chain still assembles deterministically by
 * projectBusinessKey/opportunityId. Style mirrors TraceabilityService.chain().
 */
@Injectable()
export class JourneyService {
  private readonly logger = new Logger(JourneyService.name);

  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(InvestmentOpportunity) private readonly opportunities: Repository<InvestmentOpportunity>,
    @InjectRepository(ConceptDocument) private readonly concepts: Repository<ConceptDocument>,
    @InjectRepository(FeasibilityAssessment) private readonly assessments: Repository<FeasibilityAssessment>,
    @InjectRepository(FeasibilityStudySection) private readonly studySections: Repository<FeasibilityStudySection>,
    @InjectRepository(DrawingPackage) private readonly drawings: Repository<DrawingPackage>,
    @InjectRepository(BoQ) private readonly boqs: Repository<BoQ>,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
    @InjectRepository(Letter) private readonly letters: Repository<Letter>,
    @InjectRepository(Claim) private readonly claims: Repository<Claim>,
    @InjectRepository(EvidenceRoom) private readonly evidenceRooms: Repository<EvidenceRoom>,
    @InjectRepository(MonthlyReport) private readonly reports: Repository<MonthlyReport>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(GovernanceDecision) private readonly decisions: Repository<GovernanceDecision>,
    @InjectRepository(LifecycleLedgerEntry) private readonly ledger: Repository<LifecycleLedgerEntry>,
  ) {}

  /**
   * Assemble the ordered journey chain for one project businessKey. Each leg is
   * present even when empty (so the UI shows the full lifecycle skeleton); the
   * `correlationIds` roll-up is the set of distinct journeyCorrelationIds found.
   */
  async chain(projectKey: string): Promise<JourneyChain> {
    if (!projectKey?.trim()) throw new BadRequestException('projectKey is required');
    const project = await this.projects.findOne({
      where: { businessKey: projectKey, isCurrent: true, ...companyScope() },
    });
    if (!project) throw new NotFoundException(`No current project "${projectKey}"`);

    const opportunityId = project.opportunityId ?? null;
    const correlationIds = new Set<string>();
    const note = (id: string | null | undefined): void => {
      if (id) correlationIds.add(id);
    };

    // ── Investment half (by opportunityId) ────────────────────────────────
    const opportunity = opportunityId
      ? await this.opportunities.findOne({ where: { id: opportunityId } })
      : null;
    note(opportunity?.journeyCorrelationId);

    const concepts = opportunityId
      ? await this.concepts.find({ where: { opportunityId }, order: { createdAt: 'ASC' } })
      : [];
    const assessments = opportunityId
      ? await this.assessments.find({ where: { opportunityId }, order: { createdAt: 'ASC' } })
      : [];
    const sections = opportunityId
      ? await this.studySections.find({ where: { opportunityId, isCurrent: true }, order: { createdAt: 'ASC' } })
      : [];
    for (const r of [...concepts, ...assessments, ...sections]) note(r.journeyCorrelationId);

    // ── Construction half (by projectBusinessKey / projectId) ─────────────
    const drawings = await this.drawings.find({ where: { projectBusinessKey: projectKey }, order: { createdAt: 'ASC' } });
    const boqs = await this.boqs.find({ where: { businessKey: `boq:${projectKey}`, isCurrent: true }, order: { createdAt: 'ASC' } });
    const activities = await this.activities.find({ where: { projectId: project.id, isCurrent: true }, order: { plannedStart: 'ASC' } });
    const letters = await this.letters.find({ where: { projectBusinessKey: projectKey }, order: { createdAt: 'ASC' } });
    const claims = await this.claims.find({ where: { projectBusinessKey: projectKey }, order: { createdAt: 'ASC' } });
    const evidenceRooms = await this.evidenceRooms.find({ where: { projectBusinessKey: projectKey }, order: { createdAt: 'ASC' } });
    const reports = await this.reports.find({ where: { projectBusinessKey: projectKey }, order: { createdAt: 'ASC' } });
    const ledger = await this.ledger.find({ where: { projectBusinessKey: projectKey, isCurrent: true }, order: { createdAt: 'ASC' } });
    for (const r of [...drawings, ...boqs, ...evidenceRooms, ...reports, ...ledger]) note(r.journeyCorrelationId);

    // Governance decisions reach a project through its alerts (alert.projectId).
    const projectAlerts = await this.alerts.find({ where: { projectId: project.id } });
    const alertIds = projectAlerts.map((a) => a.id);
    const decisions = alertIds.length
      ? await this.decisions.find({ where: { alertId: In(alertIds) }, order: { createdAt: 'ASC' } })
      : [];
    for (const d of decisions) note(d.journeyCorrelationId);

    const legs: JourneyLeg[] = [
      {
        stage: 'opportunity', label: 'Investment opportunity',
        items: opportunity ? [{
          id: opportunity.id, code: opportunity.code, title: opportunity.title,
          stage: opportunity.stage, projectType: opportunity.projectType,
          journeyCorrelationId: opportunity.journeyCorrelationId,
        }] : [],
      },
      {
        stage: 'concept', label: 'Concept sketch / intake',
        items: concepts.map((c) => ({
          id: c.id, filename: c.filename, extractionStatus: c.extractionStatus,
          journeyCorrelationId: c.journeyCorrelationId,
        })),
      },
      {
        stage: 'feasibility', label: 'Feasibility assessment',
        items: assessments.map((a) => ({
          id: a.id, level: a.level, recommendation: a.recommendation,
          riskRating: a.riskRating, journeyCorrelationId: a.journeyCorrelationId,
        })),
      },
      {
        stage: 'study', label: 'Feasibility study sections',
        items: sections.map((s) => ({
          id: s.id, sectionKey: s.sectionKey, title: s.title, status: s.status,
          journeyCorrelationId: s.journeyCorrelationId,
        })),
      },
      {
        stage: 'bim', label: 'Drawings / BIM',
        items: drawings.map((d) => ({
          id: d.id, filename: d.filename, format: d.format,
          journeyCorrelationId: d.journeyCorrelationId,
        })),
      },
      {
        stage: 'boq', label: 'Bill of Quantities',
        items: boqs.map((b) => ({
          id: b.id, businessKey: b.businessKey, totalAmount: b.totalAmount,
          currency: b.currency, journeyCorrelationId: b.journeyCorrelationId,
        })),
      },
      {
        stage: 'schedule', label: 'Schedule activities',
        items: activities.map((a) => ({
          id: a.id, businessKey: a.businessKey, wbsCode: a.wbsCode, name: a.name,
          plannedStart: a.plannedStart, plannedFinish: a.plannedFinish,
        })),
      },
      {
        stage: 'cost-ledger', label: 'Quantity / cost traceability ledger',
        items: ledger.map((l) => ({
          id: l.id, dimension: l.dimension, subjectKey: l.subjectKey, stage: l.stage,
          value: l.value, journeyCorrelationId: l.journeyCorrelationId,
        })),
      },
      {
        stage: 'contract', label: 'Contract letters',
        items: letters.map((l) => ({
          id: l.id, subject: l.subject, trigger: l.trigger, status: l.status,
          fidicClauseRef: l.fidicClauseRef,
        })),
      },
      {
        stage: 'claims', label: 'Claims',
        items: claims.map((c) => ({
          id: c.id, title: c.title, type: c.type, status: c.status,
          fidicClause: c.fidicClause,
        })),
      },
      {
        stage: 'site-evidence', label: 'Evidence room(s)',
        items: evidenceRooms.map((e) => ({
          id: e.id, title: e.title, kind: e.kind, status: e.status,
          journeyCorrelationId: e.journeyCorrelationId,
        })),
      },
      {
        stage: 'report', label: 'Monthly reports',
        items: reports.map((r) => ({
          id: r.id, periodKey: r.periodKey ?? r.month, audience: r.audience, status: r.status,
          journeyCorrelationId: r.journeyCorrelationId,
        })),
      },
      {
        stage: 'decision', label: 'Governance decisions',
        items: decisions.map((d) => ({
          id: d.id, alertId: d.alertId, responsibleParty: d.responsibleParty,
          escalationLevel: d.escalationLevel, journeyCorrelationId: d.journeyCorrelationId,
        })),
      },
    ];

    const totalItems = legs.reduce((s, l) => s + l.items.length, 0);
    this.logger.log(
      `Journey for ${projectKey}: ${totalItems} item(s) across ${legs.length} leg(s), ` +
      `${correlationIds.size} correlation id(s)${opportunityId ? `, opportunity ${opportunityId}` : ''}.`,
    );

    return {
      projectKey,
      projectName: project.name ?? null,
      opportunityId,
      correlationIds: [...correlationIds],
      legs,
    };
  }
}
