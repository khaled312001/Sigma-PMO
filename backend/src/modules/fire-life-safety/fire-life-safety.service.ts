import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FireSafetyRecord } from '../canonical/entities/fire-safety-record.entity';

/** Input to create a fire-safety record (createdBy is stamped by the controller). */
export interface CreateFireSafetyRecordInput {
  projectKey: string;
  title: string;
  /** fire_strategy | fire_drawing | civil_defense_review | testing_commissioning | inspection. */
  recordType: string;
  authority?: string | null;
  /** draft | submitted | under_review | comments | approved | rejected. */
  status?: string;
  openComments?: number;
  submittedDate?: string | null;
  approvalForecastDate?: string | null;
  severity?: string | null;
  /** { comments:[{date,from,note}], history:[] }. */
  details?: Record<string, unknown> | null;
  createdBy?: string | null;
}

/** Patch to a fire-safety record (only the mutable tracking fields). */
export interface UpdateFireSafetyRecordInput {
  title?: string;
  recordType?: string;
  authority?: string | null;
  status?: string;
  openComments?: number;
  submittedDate?: string | null;
  approvalForecastDate?: string | null;
  severity?: string | null;
  details?: Record<string, unknown> | null;
}

const RECORD_TYPES = ['fire_strategy', 'fire_drawing', 'civil_defense_review', 'testing_commissioning', 'inspection'];
const RECORD_STATUSES = ['draft', 'submitted', 'under_review', 'comments', 'approved', 'rejected'];

/**
 * FireLifeSafetyService — the fire-safety-record store under Fire & Life Safety
 * Governance (Mr. Ayham, 2026-06-13 17-stage lifecycle scope). Plain CRUD over
 * the FireSafetyRecord entity (fire strategy/drawings, civil-defence reviews,
 * testing & commissioning, inspections — with open-comment counts and approval
 * forecasts) with an FLS-### business key per project. No readiness mathematics
 * lives here — that is FireLifeSafetyGovernanceService; this file only persists
 * state. Append-only by (businessKey, isCurrent): an update supersedes the prior
 * current row with an incremented version, preserving the change history (same
 * discipline as every canonical versioned entity).
 */
@Injectable()
export class FireLifeSafetyService {
  private readonly logger = new Logger(FireLifeSafetyService.name);

  constructor(
    @InjectRepository(FireSafetyRecord) private readonly records: Repository<FireSafetyRecord>,
  ) {}

  /** All current fire-safety records for a project (newest first). */
  list(projectKey: string): Promise<FireSafetyRecord[]> {
    if (!projectKey?.trim()) throw new BadRequestException('projectKey is required');
    return this.records.find({
      where: { projectBusinessKey: projectKey, isCurrent: true },
      order: { createdAt: 'DESC' },
    });
  }

  /** A single current record by id. */
  async get(id: string): Promise<FireSafetyRecord> {
    const row = await this.records.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Fire-safety record "${id}" not found`);
    return row;
  }

  /** Create a record, assigning the next FLS-### business key for the project. */
  async createRecord(input: CreateFireSafetyRecordInput): Promise<FireSafetyRecord> {
    if (!input?.projectKey?.trim()) throw new BadRequestException('projectKey is required');
    if (!input.title?.trim()) throw new BadRequestException('title is required');
    if (!RECORD_TYPES.includes(input.recordType)) {
      throw new BadRequestException(`recordType must be one of: ${RECORD_TYPES.join(', ')}`);
    }
    const status = input.status ?? 'submitted';
    if (!RECORD_STATUSES.includes(status)) {
      throw new BadRequestException(`status must be one of: ${RECORD_STATUSES.join(', ')}`);
    }
    if (input.openComments !== undefined && (!Number.isFinite(input.openComments) || input.openComments < 0)) {
      throw new BadRequestException('openComments must be a non-negative number');
    }

    // Count by current rows so superseded versions do not inflate the sequence.
    const count = await this.records.count({
      where: { projectBusinessKey: input.projectKey, isCurrent: true },
    });
    const businessKey = `FLS-${String(count + 1).padStart(3, '0')}`;

    const saved = await this.records.save(this.records.create({
      projectBusinessKey: input.projectKey,
      businessKey,
      title: input.title.trim(),
      recordType: input.recordType,
      authority: input.authority ?? null,
      status,
      openComments: intOrZero(input.openComments),
      submittedDate: input.submittedDate ?? null,
      approvalForecastDate: input.approvalForecastDate ?? null,
      severity: input.severity ?? null,
      details: input.details ?? null,
      version: 1,
      isCurrent: true,
      createdBy: input.createdBy ?? null,
    }));
    this.logger.log(`Created fire-safety record ${businessKey} (${saved.recordType}, ${saved.status}) for ${input.projectKey}.`);
    return saved;
  }

  /**
   * Update a record's tracking fields. Append-only: supersedes the prior current
   * row (isCurrent=false) and inserts a new version that carries the same
   * id-namespace business key, so the full review/approval history survives.
   */
  async updateRecord(id: string, patch: UpdateFireSafetyRecordInput): Promise<FireSafetyRecord> {
    const prior = await this.get(id);
    if (patch.recordType !== undefined && !RECORD_TYPES.includes(patch.recordType)) {
      throw new BadRequestException(`recordType must be one of: ${RECORD_TYPES.join(', ')}`);
    }
    if (patch.status !== undefined && !RECORD_STATUSES.includes(patch.status)) {
      throw new BadRequestException(`status must be one of: ${RECORD_STATUSES.join(', ')}`);
    }
    if (patch.openComments !== undefined && (!Number.isFinite(patch.openComments) || patch.openComments < 0)) {
      throw new BadRequestException('openComments must be a non-negative number');
    }

    prior.isCurrent = false;
    await this.records.save(prior);

    const next = await this.records.save(this.records.create({
      projectBusinessKey: prior.projectBusinessKey,
      businessKey: prior.businessKey,
      title: patch.title?.trim() ?? prior.title,
      recordType: patch.recordType ?? prior.recordType,
      authority: patch.authority !== undefined ? patch.authority : prior.authority,
      status: patch.status ?? prior.status,
      openComments: patch.openComments !== undefined ? intOrZero(patch.openComments) : prior.openComments,
      submittedDate: patch.submittedDate !== undefined ? patch.submittedDate : prior.submittedDate,
      approvalForecastDate: patch.approvalForecastDate !== undefined ? patch.approvalForecastDate : prior.approvalForecastDate,
      severity: patch.severity !== undefined ? patch.severity : prior.severity,
      details: patch.details !== undefined ? patch.details : prior.details,
      version: prior.version + 1,
      isCurrent: true,
      createdBy: prior.createdBy,
    }));
    this.logger.log(`Updated fire-safety record ${prior.businessKey} → v${next.version} for ${prior.projectBusinessKey}.`);
    return next;
  }
}

const intOrZero = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
