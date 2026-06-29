import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { AlertSeverity } from '../../common/enums';
import {
  Activity,
  Alert,
  BoQ,
  ConfidenceScore,
  FeasibilityAssessment,
  GovernanceDecision,
  InvestmentOpportunity,
  MonthlyReport,
  Project,
  SiteEvidence,
} from '../canonical/entities';
import { ClaudeService, PersonaCallResult } from '../claude/claude.service';
import { SnapshotService } from '../rules/snapshot.service';
import { ProjectSnapshot } from '../rules/types';
import { Source } from '../sources/source.entity';
import { SourcesService } from '../sources/sources.service';
import { MonthlyReportService } from './monthly-report.service';
import { PdfRendererService } from './pdf-renderer.service';

/**
 * Test plan:
 *  - Claude disabled path → deterministic-only narrative + zero citations.
 *  - Claude enabled, persona returns prose + 2 valid citations → llm row with
 *    the citations filtered to known sources.
 *  - Claude enabled, persona returns prose with ZERO citations → citation
 *    guard fires, row reverts to deterministic.
 *  - Claude enabled, persona returns prose with a mix of known + unknown
 *    citations → unknown ids are dropped, kept set is the valid intersection.
 *  - Monthly facts block contains: project name, period bounds, alert
 *    counts by severity, decisions in window, BoQ total, confidence average.
 *  - Persona slug pinned to `report-narrator-arabic`; modelTier override
 *    sends Opus for owner/pd, Sonnet for contractor.
 *  - `assertMonth` rejects malformed monthIso ("2026-13" → throws).
 *  - `list` filters by projectKey + month and orders newest first.
 *
 * Anthropic SDK is never touched — `ClaudeService` is faked.
 */

function makeReportRepo() {
  const store: MonthlyReport[] = [];
  let idCounter = 1;
  return {
    store,
    create: jest.fn((init: Partial<MonthlyReport>) => ({ ...init }) as MonthlyReport),
    save: jest.fn(async (entity: MonthlyReport) => {
      if (!entity.id) entity.id = `mr-${idCounter++}`;
      if (!entity.createdAt) entity.createdAt = new Date();
      const idx = store.findIndex((r) => r.id === entity.id);
      if (idx >= 0) store[idx] = entity;
      else store.push(entity);
      return entity;
    }),
    findOne: jest.fn(async ({ where }: { where: Partial<MonthlyReport> }) => {
      return store.find((r) => (where.id ? r.id === where.id : false)) ?? null;
    }),
    find: jest.fn(
      async ({
        where,
        order,
      }: {
        where?: Partial<MonthlyReport>;
        order?: Record<string, 'ASC' | 'DESC'>;
      }) => {
        const rows = store.filter((r) => {
          if (where?.projectBusinessKey && r.projectBusinessKey !== where.projectBusinessKey) {
            return false;
          }
          if (where?.month && r.month !== where.month) return false;
          return true;
        });
        if (order?.createdAt === 'DESC') {
          rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return rows;
      },
    ),
  };
}

function makeProjectRepo(project: Project) {
  return {
    findOne: jest.fn(async () => project),
    find: jest.fn(async () => [{ id: project.id }] as Project[]),
  };
}

function makeAlertRepo(rows: Alert[]) {
  return { find: jest.fn(async () => rows) };
}

function makeDecisionRepo(rows: GovernanceDecision[]) {
  return { find: jest.fn(async () => rows) };
}

function makeConfidenceRepo(rows: ConfidenceScore[]) {
  return { find: jest.fn(async () => rows) };
}

function makeBoqRepo(row: BoQ | null) {
  return { findOne: jest.fn(async () => row) };
}

function makeOpportunityRepo(rows: InvestmentOpportunity[] = []) {
  return { find: jest.fn(async () => rows) };
}

function makeAssessmentRepo(rows: FeasibilityAssessment[] = []) {
  return { find: jest.fn(async () => rows) };
}

function makeSiteEvidenceRepo(rows: SiteEvidence[] = []) {
  return { find: jest.fn(async () => rows) };
}

function makeSiteEvidence(overrides: Partial<SiteEvidence> = {}): SiteEvidence {
  return {
    id: 'se-1',
    createdAt: new Date('2026-06-28T08:00:00Z'),
    companyId: null,
    projectBusinessKey: 'P-1000',
    mediaKind: 'photo',
    filename: 'capture.jpg',
    mimeType: 'image/jpeg',
    bytes: 1024,
    sha256: 'a'.repeat(64),
    storedPath: 'site-evidence/P-1000/capture.jpg',
    capturedAt: new Date('2026-06-28T08:00:00Z'),
    reportDate: '2026-06-28',
    latitude: '24.4500000',
    longitude: '54.3700000',
    locationLabel: 'Level 3 slab',
    activityKey: 'A-100',
    workerName: 'Ali',
    workerId: 'W-1',
    deviceId: 'D-1',
    deviceType: 'smart_glasses',
    transcriptText: null,
    findingType: null,
    linkedSafetyRecordId: null,
    linkedQualityRecordId: null,
    capturedBy: 'foreman',
    ...overrides,
  } as SiteEvidence;
}

function makeSnapshotService(snapshot: ProjectSnapshot): SnapshotService {
  return {
    load: jest.fn(async () => snapshot),
    loadAllCurrent: jest.fn(async () => [snapshot]),
  } as unknown as SnapshotService;
}

function makeClaudeService(opts: {
  enabled: boolean;
  result?: PersonaCallResult;
  throwError?: Error;
}) {
  const calls: Array<{ slug: string; userMessage: string; context: unknown }> = [];
  const fake = {
    calls,
    isEnabled: jest.fn(() => opts.enabled),
    callPersona: jest.fn(
      async (slug: string, userMessage: string, context: unknown) => {
        calls.push({ slug, userMessage, context });
        if (opts.throwError) throw opts.throwError;
        if (!opts.result) {
          throw new Error('callPersona invoked without a canned result');
        }
        return opts.result;
      },
    ),
  };
  return fake as unknown as ClaudeService & typeof fake;
}

function makeSourcesService(known: Set<string>): SourcesService {
  return {
    findByExternalId: jest.fn(async (id: string) => {
      if (!known.has(id)) {
        throw new NotFoundException(`No source with externalId ${id}`);
      }
      return { externalId: id } as Source;
    }),
  } as unknown as SourcesService;
}

function makePdfService(): PdfRendererService {
  return {
    render: jest.fn(async (id: string) => ({
      storedPath: `monthly-reports/2026-05/${id}.pdf`,
      byteSize: 1024,
    })),
    resolveAbsolutePath: jest.fn((p: string) => `/storage/${p}`),
  } as unknown as PdfRendererService;
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    createdAt: new Date(),
    ingestionRunId: 'run-1',
    sourceFileId: 'sf-1',
    businessKey: 'P-1000',
    version: 1,
    isCurrent: true,
    rawSource: {},
    name: 'Etihad Tower Phase 2',
    status: 'active',
    clientName: 'Etihad Holdings',
    currency: 'AED',
    dataDate: '2026-05-31',
    plannedStart: '2025-01-01',
    plannedFinish: '2027-06-30',
    actualStart: '2025-01-15',
    actualFinish: null,
    budgetAtCompletion: '500000000.00',
    ...overrides,
  } as Project;
}

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'a-1',
    createdAt: new Date(),
    ingestionRunId: 'run-1',
    sourceFileId: 'sf-1',
    businessKey: 'A-100',
    version: 1,
    isCurrent: true,
    rawSource: {},
    projectId: 'proj-1',
    wbsCode: '1.1',
    name: 'Excavation',
    activityType: 'Task',
    status: 'In Progress',
    plannedStart: '2026-05-01',
    plannedFinish: '2026-05-31',
    actualStart: '2026-05-02',
    actualFinish: null,
    plannedDurationDays: 30,
    remainingDurationDays: 5,
    plannedPctComplete: 0.8,
    actualPctComplete: 0.6,
    budgetedCost: '100000.00',
    actualCost: '95000.00',
    ...overrides,
  } as Activity;
}

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'al-1',
    createdAt: new Date('2026-05-15T10:00:00Z'),
    code: 'SCHEDULE_BEHIND_PLAN',
    severity: AlertSeverity.CRITICAL,
    summary: 'Activity A-100 is 20% behind plan.',
    projectId: 'proj-1',
    activityId: 'a-1',
    resourceId: null,
    assignmentId: null,
    reportId: null,
    ingestionRunId: 'run-1',
    sourceFileId: 'sf-1',
    ruleEvaluationId: 're-1',
    context: { planned: 0.8, actual: 0.6 },
    ...overrides,
  } as Alert;
}

function makeDecision(overrides: Partial<GovernanceDecision> = {}): GovernanceDecision {
  return {
    id: 'gd-1',
    createdAt: new Date('2026-05-20T10:00:00Z'),
    alertId: 'al-1',
    policyId: 'pol-1',
    policyVersion: 1,
    responsibleParty: 'contractor',
    fidicClause: '8.5',
    fidicNotice: 'EOT request',
    fidicDeadlineDays: 28,
    escalationLevel: 'L2',
    notifyParties: ['contractor', 'engineer'],
    interventions: ['issue EOT notice', 'mobilise additional crew'],
    rationale: 'Critical schedule slip on A-100; FIDIC 8.5 EOT applicable.',
    ...overrides,
  } as GovernanceDecision;
}

function makeBoq(overrides: Partial<BoQ> = {}): BoQ {
  return {
    id: 'boq-1',
    createdAt: new Date(),
    businessKey: 'boq:P-1000',
    version: 1,
    isCurrent: true,
    currency: 'AED',
    totalAmount: '500000000.00',
    sourceFileId: 'sf-2',
    authoredBy: 'system',
    ...overrides,
  } as BoQ;
}

function makeConfidence(overrides: Partial<ConfidenceScore> = {}): ConfidenceScore {
  return {
    id: 'cs-1',
    createdAt: new Date(),
    ingestionRunId: 'run-1',
    overall: 0.85,
    ...overrides,
  } as unknown as ConfidenceScore;
}

function makeSnapshot(): ProjectSnapshot {
  return {
    project: makeProject(),
    activities: [makeActivity(), makeActivity({ id: 'a-2', businessKey: 'A-200', actualPctComplete: 1, plannedPctComplete: 1 })],
    resources: [],
    assignments: [],
    reports: [],
  };
}

function buildService(opts: {
  claude: ClaudeService;
  sources: SourcesService;
  reportRepo?: ReturnType<typeof makeReportRepo>;
  alerts?: Alert[];
  decisions?: GovernanceDecision[];
  boq?: BoQ | null;
  confidence?: ConfidenceScore[];
  siteEvidence?: SiteEvidence[];
}) {
  const reportRepo = opts.reportRepo ?? makeReportRepo();
  const projectRepo = makeProjectRepo(makeProject());
  const alertRepo = makeAlertRepo(opts.alerts ?? [makeAlert()]);
  const decisionRepo = makeDecisionRepo(opts.decisions ?? [makeDecision()]);
  const confidenceRepo = makeConfidenceRepo(opts.confidence ?? [makeConfidence()]);
  const boqRepo = makeBoqRepo(opts.boq === undefined ? makeBoq() : opts.boq);
  const opportunityRepo = makeOpportunityRepo();
  const assessmentRepo = makeAssessmentRepo();
  const siteEvidenceRepo = makeSiteEvidenceRepo(opts.siteEvidence ?? []);
  const snapshots = makeSnapshotService(makeSnapshot());
  const pdf = makePdfService();
  const service = new MonthlyReportService(
    reportRepo as unknown as Repository<MonthlyReport>,
    projectRepo as unknown as Repository<Project>,
    alertRepo as unknown as Repository<Alert>,
    decisionRepo as unknown as Repository<GovernanceDecision>,
    confidenceRepo as unknown as Repository<ConfidenceScore>,
    boqRepo as unknown as Repository<BoQ>,
    opportunityRepo as unknown as Repository<InvestmentOpportunity>,
    assessmentRepo as unknown as Repository<FeasibilityAssessment>,
    snapshots,
    opts.claude,
    opts.sources,
    pdf,
    undefined, // ProjectOwnershipService (optional)
    undefined, // Communication repo (optional)
    siteEvidenceRepo as unknown as Repository<SiteEvidence>,
  );
  return { service, reportRepo, projectRepo, alertRepo, decisionRepo, boqRepo, pdf };
}

describe('MonthlyReportService', () => {
  describe('input validation', () => {
    it('rejects malformed monthIso', async () => {
      const claude = makeClaudeService({ enabled: false });
      const sources = makeSourcesService(new Set());
      const { service } = buildService({ claude, sources });
      await expect(
        service.generateMonthly({ projectKey: 'P-1000', monthIso: '2026-13', audience: 'owner' }),
      ).rejects.toThrow(/monthIso/);
    });

    it('rejects an unknown projectKey', async () => {
      const claude = makeClaudeService({ enabled: false });
      const sources = makeSourcesService(new Set());
      const { service, projectRepo } = buildService({ claude, sources });
      (projectRepo.findOne as jest.Mock).mockResolvedValueOnce(null);
      await expect(
        service.generateMonthly({ projectKey: 'NOPE', monthIso: '2026-05', audience: 'owner' }),
      ).rejects.toThrow(/No current project/);
    });
  });

  describe('periodic path (Wave 4 daily + weekly)', () => {
    it('produces a daily row stamped with cadence=day + periodKey=YYYY-MM-DD', async () => {
      const claude = makeClaudeService({ enabled: false });
      const sources = makeSourcesService(new Set());
      const { service } = buildService({ claude, sources });

      const row = await service.generatePeriodic({
        projectKey: 'P-1000',
        cadence: 'day',
        periodKey: '2026-05-15',
        audience: 'pd',
      });

      expect(row.cadence).toBe('day');
      expect(row.periodKey).toBe('2026-05-15');
      expect(row.month).toBe('2026-05');
      expect(row.narrative).toContain('DAY 2026-05-15');
    });

    it('produces a weekly row stamped with cadence=week + ISO week periodKey', async () => {
      const claude = makeClaudeService({ enabled: false });
      const sources = makeSourcesService(new Set());
      const { service } = buildService({ claude, sources });

      const row = await service.generatePeriodic({
        projectKey: 'P-1000',
        cadence: 'week',
        periodKey: '2026-W20',
        audience: 'owner',
      });

      expect(row.cadence).toBe('week');
      expect(row.periodKey).toBe('2026-W20');
      expect(row.month).toMatch(/^\d{4}-\d{2}$/);
      expect(row.narrative).toContain('WEEK 2026-W20');
    });

    it('rejects malformed daily periodKey', async () => {
      const claude = makeClaudeService({ enabled: false });
      const sources = makeSourcesService(new Set());
      const { service } = buildService({ claude, sources });
      await expect(
        service.generatePeriodic({
          projectKey: 'P-1000',
          cadence: 'day',
          periodKey: '2026/05/15',
          audience: 'owner',
        }),
      ).rejects.toThrow(/daily periodKey/);
    });

    it('rejects malformed weekly periodKey', async () => {
      const claude = makeClaudeService({ enabled: false });
      const sources = makeSourcesService(new Set());
      const { service } = buildService({ claude, sources });
      await expect(
        service.generatePeriodic({
          projectKey: 'P-1000',
          cadence: 'week',
          periodKey: '2026-20',
          audience: 'owner',
        }),
      ).rejects.toThrow(/weekly periodKey/);
    });
  });

  describe('deterministic path (Claude disabled)', () => {
    it('produces a row with narrativeSource=deterministic and zero citations', async () => {
      const claude = makeClaudeService({ enabled: false });
      const sources = makeSourcesService(new Set(['fidic-red-2017']));
      const { service } = buildService({ claude, sources });

      const row = await service.generateMonthly({
        projectKey: 'P-1000',
        monthIso: '2026-05',
        audience: 'owner',
      });

      expect(row.narrativeSource).toBe('deterministic');
      expect(row.citations).toEqual([]);
      expect(row.personaSlug).toBe('report-narrator-arabic');
      expect(row.audience).toBe('owner');
      expect(row.month).toBe('2026-05');
      expect(row.projectBusinessKey).toBe('P-1000');
      expect(row.status).toBe('generated');
      expect(row.pdfStoredPath).toBeNull();
      // The deterministic facts block must include the project name + period.
      expect(row.narrative).toContain('Etihad Tower Phase 2');
      expect(row.narrative).toContain('2026-05');
      expect(claude.callPersona).not.toHaveBeenCalled();
    });

    it('records metrics: activity counts, alerts by severity, BoQ total, confidence', async () => {
      const claude = makeClaudeService({ enabled: false });
      const sources = makeSourcesService(new Set());
      const { service } = buildService({
        claude,
        sources,
        alerts: [
          makeAlert(),
          makeAlert({ id: 'al-2', severity: AlertSeverity.WARNING, code: 'COST_OVERRUN' }),
        ],
      });

      const row = await service.generateMonthly({
        projectKey: 'P-1000',
        monthIso: '2026-05',
        audience: 'pd',
      });
      const m = row.metrics as Record<string, unknown>;
      expect(m.activityCount).toBe(2);
      expect(m.alertCount).toBe(2);
      expect(m.criticalAlertCount).toBe(1);
      expect(m.warningAlertCount).toBe(1);
      expect(m.boqCurrency).toBe('AED');
      expect(m.boqTotalAmount).toBe('500000000.00');
      expect(m.confidenceAverage).toBeCloseTo(0.85, 5);
    });

    it('omits alerts outside the calendar month window', async () => {
      const claude = makeClaudeService({ enabled: false });
      const sources = makeSourcesService(new Set());
      const insideMay = makeAlert({ id: 'in-may', createdAt: new Date('2026-05-15T10:00:00Z') });
      const outsideJune = makeAlert({ id: 'in-jun', createdAt: new Date('2026-06-02T10:00:00Z') });
      const { service } = buildService({ claude, sources, alerts: [insideMay, outsideJune] });

      const row = await service.generateMonthly({
        projectKey: 'P-1000',
        monthIso: '2026-05',
        audience: 'pd',
      });
      expect((row.metrics as { alertCount: number }).alertCount).toBe(1);
    });
  });

  describe('site-evidence section (Mr. Ayham acceptance 2026-06-28)', () => {
    it('includes a Site evidence block + metrics for captures in the daily window', async () => {
      const claude = makeClaudeService({ enabled: false });
      const sources = makeSourcesService(new Set());
      const quality = makeSiteEvidence({
        id: 'se-q',
        mediaKind: 'photo',
        filename: 'crack.jpg',
        reportDate: '2026-06-28',
        findingType: 'quality',
        linkedQualityRecordId: 'QR-1',
        locationLabel: 'Column C4',
      });
      const safety = makeSiteEvidence({
        id: 'se-s',
        mediaKind: 'video',
        filename: 'fall-hazard.mp4',
        reportDate: '2026-06-28',
        findingType: 'safety',
        linkedSafetyRecordId: 'SR-9',
        locationLabel: 'Edge protection N face',
      });
      const { service } = buildService({ claude, sources, siteEvidence: [quality, safety] });

      const row = await service.generatePeriodic({
        projectKey: 'P-1000',
        cadence: 'day',
        periodKey: '2026-06-28',
        audience: 'owner',
      });

      // Facts carry a Site evidence section naming both captures + record keys.
      expect(row.narrative).toContain('### Site evidence');
      expect(row.narrative).toContain('Captured in window: 2');
      expect(row.narrative).toContain('1 safety, 1 quality');
      expect(row.narrative).toContain('QR-1');
      expect(row.narrative).toContain('SR-9');

      // Metrics carry the site-evidence counts.
      const m = row.metrics as Record<string, unknown>;
      expect(m.siteEvidenceCount).toBe(2);
      expect(m.siteEvidenceSafetyFindings).toBe(1);
      expect(m.siteEvidenceQualityFindings).toBe(1);
      expect((m.siteEvidenceByKind as Record<string, number>).photo).toBe(1);
      expect((m.siteEvidenceByKind as Record<string, number>).video).toBe(1);
      expect(m.siteEvidenceGeotagged).toBe(2);
      expect(claude.callPersona).not.toHaveBeenCalled();
    });

    it('excludes captures outside the window', async () => {
      const claude = makeClaudeService({ enabled: false });
      const sources = makeSourcesService(new Set());
      const inDay = makeSiteEvidence({ id: 'in', reportDate: '2026-06-28' });
      const outDay = makeSiteEvidence({ id: 'out', reportDate: '2026-06-30' });
      const { service } = buildService({ claude, sources, siteEvidence: [inDay, outDay] });

      const row = await service.generatePeriodic({
        projectKey: 'P-1000',
        cadence: 'day',
        periodKey: '2026-06-28',
        audience: 'owner',
      });
      expect((row.metrics as { siteEvidenceCount: number }).siteEvidenceCount).toBe(1);
    });

    it('omits the Site evidence section when there are no captures', async () => {
      const claude = makeClaudeService({ enabled: false });
      const sources = makeSourcesService(new Set());
      const { service } = buildService({ claude, sources, siteEvidence: [] });

      const row = await service.generatePeriodic({
        projectKey: 'P-1000',
        cadence: 'day',
        periodKey: '2026-06-28',
        audience: 'owner',
      });
      expect(row.narrative).not.toContain('### Site evidence');
      expect((row.metrics as { siteEvidenceCount: number }).siteEvidenceCount).toBe(0);
    });
  });

  describe('LLM path (Claude enabled)', () => {
    function cannedResult(overrides: Partial<PersonaCallResult> = {}): PersonaCallResult {
      return {
        content:
          'الحكم التنفيذي: المشروع متأخر بنقطتين مئويتين عن المسار المخطّط ...\n\n' +
          'تستند هذه القراءة إلى مقتضيات [SOURCE: aace-rp-49r-06] في تحديد المسار الحرج ' +
          'وإلى البند 8.5 من [SOURCE: fidic-red-2017] لإخطار تمديد المدة.',
        citations: ['aace-rp-49r-06', 'fidic-red-2017'],
        tokensIn: 4200,
        tokensOut: 1100,
        cached: false,
        personaSlug: 'report-narrator-arabic',
        personaVersion: 1,
        model: 'claude-opus-4-5',
        stopReason: 'end_turn',
        ...overrides,
      };
    }

    it('uses Claude prose + keeps citations that resolve in the SourceRegistry', async () => {
      const claude = makeClaudeService({ enabled: true, result: cannedResult() });
      const sources = makeSourcesService(new Set(['aace-rp-49r-06', 'fidic-red-2017']));
      const { service } = buildService({ claude, sources });

      const row = await service.generateMonthly({
        projectKey: 'P-1000',
        monthIso: '2026-05',
        audience: 'pd',
      });
      expect(row.narrativeSource).toBe('llm');
      expect(row.llmModel).toBe('claude-opus-4-5');
      expect(row.citations).toEqual(['aace-rp-49r-06', 'fidic-red-2017']);
      expect(row.narrative).toContain('الحكم التنفيذي');
      expect(claude.callPersona).toHaveBeenCalledWith(
        'report-narrator-arabic',
        expect.stringContaining('Project Director'),
        expect.objectContaining({ modelTier: 'claude-opus' }),
      );
    });

    it('pins modelTier to claude-sonnet for the contractor view', async () => {
      const claude = makeClaudeService({ enabled: true, result: cannedResult() });
      const sources = makeSourcesService(new Set(['aace-rp-49r-06', 'fidic-red-2017']));
      const { service } = buildService({ claude, sources });

      await service.generateMonthly({
        projectKey: 'P-1000',
        monthIso: '2026-05',
        audience: 'contractor',
      });
      expect(claude.callPersona).toHaveBeenCalledWith(
        'report-narrator-arabic',
        expect.any(String),
        expect.objectContaining({ modelTier: 'claude-sonnet' }),
      );
    });

    it('drops citation ids that are not in the SourceRegistry', async () => {
      const claude = makeClaudeService({
        enabled: true,
        result: cannedResult({
          citations: ['fidic-red-2017', 'not-a-real-source'],
        }),
      });
      const sources = makeSourcesService(new Set(['fidic-red-2017']));
      const { service } = buildService({ claude, sources });

      const row = await service.generateMonthly({
        projectKey: 'P-1000',
        monthIso: '2026-05',
        audience: 'owner',
      });
      // Unknown id is dropped; known id kept; narrativeSource stays llm
      // because at least one citation survived the filter.
      expect(row.citations).toEqual(['fidic-red-2017']);
      expect(row.narrativeSource).toBe('llm');
    });

    it('citation guard: zero citations from Claude → row reverts to deterministic', async () => {
      const claude = makeClaudeService({
        enabled: true,
        result: cannedResult({ citations: [] }),
      });
      const sources = makeSourcesService(new Set(['fidic-red-2017']));
      const { service } = buildService({ claude, sources });

      const row = await service.generateMonthly({
        projectKey: 'P-1000',
        monthIso: '2026-05',
        audience: 'owner',
      });
      expect(row.narrativeSource).toBe('deterministic');
      expect(row.citations).toEqual([]);
      expect(row.llmModel).toBeNull();
      // The narrative is the facts block, not the persona prose.
      expect(row.narrative).toContain('Deterministic facts');
    });

    it('falls back to deterministic when Claude throws', async () => {
      const claude = makeClaudeService({
        enabled: true,
        throwError: new Error('Anthropic rate limited'),
      });
      const sources = makeSourcesService(new Set(['fidic-red-2017']));
      const { service } = buildService({ claude, sources });

      const row = await service.generateMonthly({
        projectKey: 'P-1000',
        monthIso: '2026-05',
        audience: 'pd',
      });
      expect(row.narrativeSource).toBe('deterministic');
      expect(row.citations).toEqual([]);
    });
  });

  describe('list', () => {
    it('filters by projectKey + month, newest first', async () => {
      const claude = makeClaudeService({ enabled: false });
      const sources = makeSourcesService(new Set());
      const { service, reportRepo } = buildService({ claude, sources });

      // Seed three reports across two months for the same project.
      reportRepo.store.push(
        {
          id: 'mr-a',
          createdAt: new Date('2026-05-10T00:00:00Z'),
          projectBusinessKey: 'P-1000',
          month: '2026-05',
          audience: 'owner',
        } as MonthlyReport,
        {
          id: 'mr-b',
          createdAt: new Date('2026-05-20T00:00:00Z'),
          projectBusinessKey: 'P-1000',
          month: '2026-05',
          audience: 'pd',
        } as MonthlyReport,
        {
          id: 'mr-c',
          createdAt: new Date('2026-06-01T00:00:00Z'),
          projectBusinessKey: 'P-1000',
          month: '2026-06',
          audience: 'owner',
        } as MonthlyReport,
      );

      const may = await service.list('P-1000', '2026-05');
      expect(may.map((r) => r.id)).toEqual(['mr-b', 'mr-a']);

      const all = await service.list('P-1000');
      expect(all).toHaveLength(3);
      expect(all[0].id).toBe('mr-c');
    });
  });

  describe('renderPdf', () => {
    it('updates pdfStoredPath + flips status to pdf-rendered', async () => {
      const claude = makeClaudeService({ enabled: false });
      const sources = makeSourcesService(new Set());
      const { service, pdf } = buildService({ claude, sources });

      const generated = await service.generateMonthly({
        projectKey: 'P-1000',
        monthIso: '2026-05',
        audience: 'owner',
      });
      const out = await service.renderPdf(generated.id);
      expect(out.row.pdfStoredPath).toMatch(/monthly-reports\/2026-05\//);
      expect(out.row.status).toBe('pdf-rendered');
      // Wave 7: the renderer key carries the edition suffix so the AR and
      // EN PDFs live side by side on disk.
      expect(pdf.render).toHaveBeenCalledWith(
        generated.id + '-ar',
        expect.objectContaining({
          audience: 'owner',
          month: '2026-05',
          projectBusinessKey: 'P-1000',
        }),
      );
    });
  });
});
