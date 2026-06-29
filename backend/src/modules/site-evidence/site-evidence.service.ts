import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Alert, Project, RuleEvaluation } from '../canonical/entities';
import { SiteEvidence } from '../canonical/entities/site-evidence.entity';
import { AlertSeverity, RuleEvaluationStatus } from '../../common/enums';
import { companyScope, currentCompanyId } from '../../common/tenant/tenant-context';
import { StorageService } from '../ingestion/storage/storage.service';
import { SafetyService } from '../safety/safety.service';
import { QualityService } from '../quality/quality.service';

const MEDIA_KINDS = ['photo', 'video', 'audio', 'transcript'];
const DEVICE_TYPES = ['smart_glasses', 'phone', 'tablet'];
const FINDING_TYPES = ['safety', 'quality'];

/** Rule code a site-safety capture raises as a governance alert. */
const SITE_SAFETY_ALERT_CODE = 'SITE_SAFETY_OBSERVATION';

export interface CaptureEvidenceInput {
  projectBusinessKey: string;
  mediaKind: string;
  filename: string;
  mimeType: string;
  contentBase64: string;
  capturedAt?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  locationLabel?: string | null;
  activityKey?: string | null;
  workerName?: string | null;
  workerId?: string | null;
  deviceId?: string | null;
  deviceType?: string | null;
  transcriptText?: string | null;
  findingType?: 'safety' | 'quality' | null;
  /** Optional finding fields when raising a safety/quality record. */
  findingTitle?: string | null;
  findingSeverity?: string | null;
  capturedBy?: string | null;
}

/**
 * SiteEvidenceService — the smart-glasses / site-evidence capture channel
 * (Mr. Ayham acceptance 2026-06-28). Decodes the base64 media, archives it
 * immutably (SHA-256) via StorageService, persists a SiteEvidence row (with
 * `reportDate` derived from `capturedAt` for the daily rollup), and — when a
 * `findingType` is supplied — raises a Safety or Quality finding that carries
 * the media's sha256 + storedPath in `details.evidence`, linking it back on the
 * row. Modelled on the OCR-ingest path in ProjectRecordService: evidence first
 * (the archive happens regardless), then the optional finding.
 *
 * A `safety` finding additionally raises a governance Alert (code
 * SITE_SAFETY_OBSERVATION) pinned to the project's current (version-pinned)
 * projectId, so the capture completes the demo chain Mr. Ayham wrote out —
 * Capture → Evidence → Report → Governance Alert → Human Approval. The
 * governance dashboard reads project alerts (`alert.projectId`) for its
 * human-approval block and the journey decision leg keys off the same alerts,
 * so the safety capture surfaces there awaiting an explicit human decision
 * (nothing is auto-approved). A thin synthetic RuleEvaluation supplies the
 * alert's provenance ids — the canonical alert is always traceable to its
 * evaluation + the archived media (sourceFileId = the SiteEvidence row id).
 */
@Injectable()
export class SiteEvidenceService {
  private readonly logger = new Logger(SiteEvidenceService.name);

  constructor(
    @InjectRepository(SiteEvidence) private readonly evidence: Repository<SiteEvidence>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(RuleEvaluation) private readonly evaluations: Repository<RuleEvaluation>,
    private readonly storage: StorageService,
    private readonly safety: SafetyService,
    private readonly quality: QualityService,
  ) {}

  async capture(input: CaptureEvidenceInput): Promise<SiteEvidence> {
    if (!input?.projectBusinessKey?.trim()) throw new BadRequestException('projectBusinessKey is required');
    if (!MEDIA_KINDS.includes(input.mediaKind)) {
      throw new BadRequestException(`mediaKind must be one of: ${MEDIA_KINDS.join(', ')}`);
    }
    if (!input.filename?.trim()) throw new BadRequestException('filename is required');
    if (!input.mimeType?.trim()) throw new BadRequestException('mimeType is required');
    if (!input.contentBase64?.trim()) throw new BadRequestException('contentBase64 is required');
    if (input.deviceType != null && !DEVICE_TYPES.includes(input.deviceType)) {
      throw new BadRequestException(`deviceType must be one of: ${DEVICE_TYPES.join(', ')}`);
    }
    if (input.findingType != null && !FINDING_TYPES.includes(input.findingType)) {
      throw new BadRequestException(`findingType must be one of: ${FINDING_TYPES.join(', ')}`);
    }

    // Immutable archive first — evidence chain before anything else.
    const buffer = Buffer.from(input.contentBase64, 'base64');
    const sha256 = this.storage.sha256(buffer);
    const storedPath = await this.storage.archive(input.filename, buffer, sha256);

    const capturedAt = input.capturedAt ? new Date(input.capturedAt) : null;
    const capturedValid = capturedAt && !Number.isNaN(capturedAt.getTime()) ? capturedAt : null;
    const reportDate = capturedValid ? capturedValid.toISOString().slice(0, 10) : null;

    const saved = await this.evidence.save(this.evidence.create({
      companyId: currentCompanyId(),
      projectBusinessKey: input.projectBusinessKey,
      mediaKind: input.mediaKind,
      filename: input.filename.trim(),
      mimeType: input.mimeType.trim(),
      bytes: buffer.length,
      sha256,
      storedPath,
      capturedAt: capturedValid,
      reportDate,
      latitude: decOrNull(input.latitude),
      longitude: decOrNull(input.longitude),
      locationLabel: input.locationLabel ?? null,
      activityKey: input.activityKey ?? null,
      workerName: input.workerName ?? null,
      workerId: input.workerId ?? null,
      deviceId: input.deviceId ?? null,
      deviceType: input.deviceType ?? null,
      transcriptText: input.transcriptText ?? null,
      findingType: input.findingType ?? null,
      linkedSafetyRecordId: null,
      linkedQualityRecordId: null,
      capturedBy: input.capturedBy ?? null,
    }));

    // Optionally promote the capture into a safety/quality finding, carrying the
    // media sha256 + storedPath as evidence and linking the record back.
    if (input.findingType === 'safety') {
      const record = await this.safety.createRecord({
        projectKey: input.projectBusinessKey,
        title: input.findingTitle?.trim() || `Site safety observation — ${input.filename}`,
        recordType: 'incident',
        severity: input.findingSeverity ?? 'medium',
        affectedActivityKeys: input.activityKey ? [input.activityKey] : null,
        details: { evidence: { siteEvidenceId: saved.id, sha256, storedPath, mediaKind: input.mediaKind } },
        createdBy: input.capturedBy ?? null,
      });
      saved.linkedSafetyRecordId = record.id;
      await this.evidence.save(saved);
      // Raise the governance alert so the capture reaches the human-approval
      // gate (Capture → Evidence → Report → Governance Alert → Human Approval).
      await this.raiseSafetyAlert(saved, record.id, input.findingSeverity ?? 'medium');
    } else if (input.findingType === 'quality') {
      const record = await this.quality.createRecord({
        projectKey: input.projectBusinessKey,
        title: input.findingTitle?.trim() || `Site quality observation — ${input.filename}`,
        recordType: 'ncr',
        severity: input.findingSeverity ?? 'medium',
        affectedActivityKeys: input.activityKey ? [input.activityKey] : null,
        details: { evidence: { siteEvidenceId: saved.id, sha256, storedPath, mediaKind: input.mediaKind } },
        createdBy: input.capturedBy ?? null,
      });
      saved.linkedQualityRecordId = record.id;
      await this.evidence.save(saved);
    }

    this.logger.log(
      `Captured ${input.mediaKind} site evidence ${saved.id} for ${input.projectBusinessKey} ` +
      `(${buffer.length} bytes${reportDate ? `, day ${reportDate}` : ''}` +
      `${saved.findingType ? `, raised ${saved.findingType} finding` : ''}).`,
    );
    return saved;
  }

  /**
   * Raise a governance Alert from a safety capture, pinned to the project's
   * current (version-pinned) projectId so it lands in the governance dashboard's
   * human-approval block and the journey decision leg. A thin synthetic
   * RuleEvaluation supplies the alert's provenance ids; `sourceFileId` is the
   * SiteEvidence row id (the capture IS the source). Best-effort: a missing
   * project is logged and skipped (the evidence + safety record already exist).
   */
  private async raiseSafetyAlert(evidence: SiteEvidence, safetyRecordId: string, severity: string): Promise<void> {
    const project = await this.projects.findOne({
      where: { businessKey: evidence.projectBusinessKey, isCurrent: true, ...companyScope() },
    });
    if (!project) {
      this.logger.warn(
        `Safety capture ${evidence.id} could not raise a governance alert: no current project ` +
        `"${evidence.projectBusinessKey}".`,
      );
      return;
    }

    const now = new Date();
    const evaluation = await this.evaluations.save(this.evaluations.create({
      projectId: project.id,
      status: RuleEvaluationStatus.COMPLETED,
      startedAt: now,
      finishedAt: now,
      alertCount: 1,
      summary: { source: 'site-evidence', siteEvidenceId: evidence.id, findingType: 'safety' },
    }));

    const alert = await this.alerts.save(this.alerts.create({
      code: SITE_SAFETY_ALERT_CODE,
      severity: severity === 'critical' || severity === 'high' ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
      summary:
        `Site safety observation captured on ${evidence.mediaKind}` +
        `${evidence.locationLabel ? ` at ${evidence.locationLabel}` : ''}` +
        `${evidence.activityKey ? ` (activity ${evidence.activityKey})` : ''} — awaiting human review.`,
      projectId: project.id,
      activityId: null,
      resourceId: null,
      assignmentId: null,
      reportId: null,
      ingestionRunId: evidence.id,
      sourceFileId: evidence.id,
      ruleEvaluationId: evaluation.id,
      context: {
        siteEvidenceId: evidence.id,
        safetyRecordId,
        sha256: evidence.sha256,
        storedPath: evidence.storedPath,
        reportDate: evidence.reportDate,
        requiresHumanApproval: true,
      },
    }));

    this.logger.log(
      `Safety capture ${evidence.id} raised governance alert ${alert.id} (${SITE_SAFETY_ALERT_CODE}, ` +
      `${alert.severity}) for ${evidence.projectBusinessKey} — awaiting human approval.`,
    );
  }

  /** A day's captured evidence for a project (the daily-report rollup). */
  list(projectKey: string, date?: string): Promise<SiteEvidence[]> {
    if (!projectKey?.trim()) throw new BadRequestException('projectKey is required');
    const where: Record<string, unknown> = { projectBusinessKey: projectKey, ...companyScope() };
    if (date) where.reportDate = date;
    return this.evidence.find({ where, order: { capturedAt: 'DESC', createdAt: 'DESC' } });
  }

  async get(id: string): Promise<SiteEvidence> {
    const row = await this.evidence.findOne({ where: { id, ...companyScope() } });
    if (!row) throw new NotFoundException(`Site evidence "${id}" not found`);
    return row;
  }
}

const decOrNull = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number.parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n.toFixed(7) : null;
};
