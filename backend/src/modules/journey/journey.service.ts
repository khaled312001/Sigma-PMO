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
import { SiteEvidence } from '../canonical/entities/site-evidence.entity';
import { EvidenceRoom } from '../evidence/evidence-room.entity';
import { companyScope } from '../../common/tenant/tenant-context';

/** One leg of the cross-module journey, in lifecycle order. */
export interface JourneyLeg {
  /** Stable lifecycle key, e.g. `opportunity`, `feasibility`, `bim`, `boq`. */
  stage: string;
  /** Same key as `stage` (the explicit per-leg presence shape Mr. Ayham asked for). */
  leg: string;
  label: string;
  /** Whether this leg has any item. An EMPTY leg records absence via `note`. */
  present: boolean;
  /** Number of items on the leg (== items.length). */
  count: number;
  /** Why the leg is empty, when `present` is false. */
  note?: string;
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
    @InjectRepository(SiteEvidence) private readonly siteEvidence: Repository<SiteEvidence>,
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
    const siteCaptures = await this.siteEvidence.find({ where: { projectBusinessKey: projectKey }, order: { createdAt: 'ASC' } });
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

    // The site-evidence leg now MERGES the EvidenceRoom dispute rooms AND the
    // SiteEvidence smart-glasses captures (photo/video/audio/transcript) — both
    // are on-site proof for the same lifecycle stage.
    const siteEvidenceItems: Array<Record<string, unknown>> = [
      ...evidenceRooms.map((e) => ({
        source: 'evidence-room' as const, id: e.id, title: e.title, kind: e.kind,
        status: e.status, journeyCorrelationId: e.journeyCorrelationId,
      })),
      ...siteCaptures.map((c) => ({
        source: 'site-capture' as const, id: c.id, mediaKind: c.mediaKind, filename: c.filename,
        capturedAt: c.capturedAt, reportDate: c.reportDate, activityKey: c.activityKey,
        locationLabel: c.locationLabel, findingType: c.findingType, sha256: c.sha256,
      })),
    ];

    // Each leg carries its `items` plus a short `note` that explains an EMPTY
    // leg (so an absence is recorded, not silently blank). `present`/`count`/`leg`
    // are filled in by `finalize()` below from items.length.
    const legs: JourneyLeg[] = [
      {
        stage: 'opportunity', label: 'Investment opportunity',
        emptyNote: 'No investment opportunity linked to this project yet',
        items: opportunity ? [{
          id: opportunity.id, code: opportunity.code, title: opportunity.title,
          stage: opportunity.stage, projectType: opportunity.projectType,
          journeyCorrelationId: opportunity.journeyCorrelationId,
        }] : [],
      },
      {
        stage: 'concept', label: 'Concept sketch / intake',
        emptyNote: 'No concept sketch ingested for this project yet',
        items: concepts.map((c) => ({
          id: c.id, filename: c.filename, extractionStatus: c.extractionStatus,
          journeyCorrelationId: c.journeyCorrelationId,
        })),
      },
      {
        stage: 'feasibility', label: 'Feasibility assessment',
        emptyNote: 'No feasibility assessment run for this project yet',
        items: assessments.map((a) => ({
          id: a.id, level: a.level, recommendation: a.recommendation,
          riskRating: a.riskRating, journeyCorrelationId: a.journeyCorrelationId,
        })),
      },
      {
        stage: 'study', label: 'Feasibility study sections',
        emptyNote: 'No feasibility study sections authored for this project yet',
        items: sections.map((s) => ({
          id: s.id, sectionKey: s.sectionKey, title: s.title, status: s.status,
          journeyCorrelationId: s.journeyCorrelationId,
        })),
      },
      {
        stage: 'bim', label: 'Drawings / BIM',
        emptyNote: 'No drawings or BIM model uploaded for this project yet',
        items: drawings.map((d) => ({
          id: d.id, filename: d.filename, format: d.format,
          journeyCorrelationId: d.journeyCorrelationId,
        })),
      },
      {
        stage: 'boq', label: 'Bill of Quantities',
        emptyNote: 'No Bill of Quantities recorded for this project yet',
        items: boqs.map((b) => ({
          id: b.id, businessKey: b.businessKey, totalAmount: b.totalAmount,
          currency: b.currency, journeyCorrelationId: b.journeyCorrelationId,
        })),
      },
      {
        stage: 'schedule', label: 'Schedule activities',
        emptyNote: 'No schedule activities ingested for this project yet',
        items: activities.map((a) => ({
          id: a.id, businessKey: a.businessKey, wbsCode: a.wbsCode, name: a.name,
          plannedStart: a.plannedStart, plannedFinish: a.plannedFinish,
        })),
      },
      {
        stage: 'cost-ledger', label: 'Quantity / cost traceability ledger',
        emptyNote: 'No cost-ledger entries recorded for this project yet',
        items: ledger.map((l) => ({
          id: l.id, dimension: l.dimension, subjectKey: l.subjectKey, stage: l.stage,
          value: l.value, journeyCorrelationId: l.journeyCorrelationId,
        })),
      },
      {
        stage: 'contract', label: 'Contract letters',
        emptyNote: 'No contract letters logged for this project yet',
        items: letters.map((l) => ({
          id: l.id, subject: l.subject, trigger: l.trigger, status: l.status,
          fidicClauseRef: l.fidicClauseRef,
        })),
      },
      {
        stage: 'claims', label: 'Claims',
        emptyNote: 'No claims raised for this project yet',
        items: claims.map((c) => ({
          id: c.id, title: c.title, type: c.type, status: c.status,
          fidicClause: c.fidicClause,
        })),
      },
      {
        stage: 'site-evidence', label: 'Site evidence (rooms + captures)',
        emptyNote: 'No evidence room or site capture recorded for this project yet',
        items: siteEvidenceItems,
      },
      {
        stage: 'report', label: 'Monthly reports',
        emptyNote: 'No monthly reports generated for this project yet',
        items: reports.map((r) => ({
          id: r.id, periodKey: r.periodKey ?? r.month, audience: r.audience, status: r.status,
          journeyCorrelationId: r.journeyCorrelationId,
        })),
      },
      {
        stage: 'decision', label: 'Governance decisions',
        emptyNote: 'No governance decision recorded for this project yet',
        items: decisions.map((d) => ({
          id: d.id, alertId: d.alertId, responsibleParty: d.responsibleParty,
          escalationLevel: d.escalationLevel, journeyCorrelationId: d.journeyCorrelationId,
        })),
      },
    ].map((l) => {
      const present = l.items.length > 0;
      return {
        stage: l.stage, leg: l.stage, label: l.label, present, count: l.items.length,
        ...(present ? {} : { note: l.emptyNote }),
        items: l.items,
      };
    });

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
