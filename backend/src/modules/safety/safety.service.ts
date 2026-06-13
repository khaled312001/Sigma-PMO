import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SafetyRecord } from '../canonical/entities/safety-record.entity';

/** Input to create a safety record (createdBy is stamped by the controller). */
export interface CreateSafetyRecordInput {
  projectKey: string;
  title: string;
  /**
   * hse_plan | daily_report | weekly_report | monthly_report | inspection |
   * permit_to_work | incident | near_miss | corrective_action | toolbox_talk |
   * audit.
   */
  recordType: string;
  /** info | low | medium | high | critical. */
  severity?: string | null;
  /** open | in_progress | closed. */
  status?: string;
  recordDate?: string | null;
  stopWork?: boolean;
  affectedActivityKeys?: string[] | null;
  eotDays?: number | null;
  details?: Record<string, unknown> | null;
  createdBy?: string | null;
}

/** Patch to a safety record (only the mutable monitoring fields). */
export interface UpdateSafetyRecordInput {
  title?: string;
  recordType?: string;
  severity?: string | null;
  status?: string;
  recordDate?: string | null;
  stopWork?: boolean;
  affectedActivityKeys?: string[] | null;
  eotDays?: number | null;
  details?: Record<string, unknown> | null;
}

const RECORD_TYPES = [
  'hse_plan',
  'daily_report',
  'weekly_report',
  'monthly_report',
  'inspection',
  'permit_to_work',
  'incident',
  'near_miss',
  'corrective_action',
  'toolbox_talk',
  'audit',
];
const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'in_progress', 'closed'];

/**
 * SafetyService — the safety-record store under Safety Governance (Mr. Ayham,
 * 2026-06-13 full governance lifecycle). Plain CRUD over the SafetyRecord
 * entity (HSE plans, reports, inspections, permits, incidents, near-misses,
 * corrective actions, toolbox talks, audits) with a SAF-### business key per
 * project. No safety mathematics lives here — that is SafetyGovernanceService;
 * this file only persists state. Append-only by (businessKey, isCurrent): an
 * update supersedes the prior current row with an incremented version,
 * preserving the change history (same discipline as every canonical versioned
 * entity).
 */
@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);

  constructor(
    @InjectRepository(SafetyRecord) private readonly records: Repository<SafetyRecord>,
  ) {}

  /** All current safety records for a project (newest first). */
  list(projectKey: string): Promise<SafetyRecord[]> {
    if (!projectKey?.trim()) throw new BadRequestException('projectKey is required');
    return this.records.find({
      where: { projectBusinessKey: projectKey, isCurrent: true },
      order: { createdAt: 'DESC' },
    });
  }

  /** A single current safety record by id. */
  async get(id: string): Promise<SafetyRecord> {
    const row = await this.records.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Safety record "${id}" not found`);
    return row;
  }

  /** Create a record, assigning the next SAF-### business key for the project. */
  async createRecord(input: CreateSafetyRecordInput): Promise<SafetyRecord> {
    if (!input?.projectKey?.trim()) throw new BadRequestException('projectKey is required');
    if (!input.title?.trim()) throw new BadRequestException('title is required');
    if (!RECORD_TYPES.includes(input.recordType)) {
      throw new BadRequestException(`recordType must be one of: ${RECORD_TYPES.join(', ')}`);
    }
    if (input.severity != null && !SEVERITIES.includes(input.severity)) {
      throw new BadRequestException(`severity must be one of: ${SEVERITIES.join(', ')}`);
    }
    const status = input.status ?? 'open';
    if (!STATUSES.includes(status)) {
      throw new BadRequestException(`status must be one of: ${STATUSES.join(', ')}`);
    }

    // Count by current rows so superseded versions do not inflate the sequence.
    const count = await this.records.count({
      where: { projectBusinessKey: input.projectKey, isCurrent: true },
    });
    const businessKey = `SAF-${String(count + 1).padStart(3, '0')}`;

    const saved = await this.records.save(this.records.create({
      projectBusinessKey: input.projectKey,
      businessKey,
      title: input.title.trim(),
      recordType: input.recordType,
      severity: input.severity ?? null,
      status,
      recordDate: input.recordDate ?? null,
      stopWork: input.stopWork ?? false,
      affectedActivityKeys: cleanKeys(input.affectedActivityKeys),
      eotDays: intOrNull(input.eotDays),
      details: input.details ?? null,
      version: 1,
      isCurrent: true,
      createdBy: input.createdBy ?? null,
    }));
    this.logger.log(`Created safety record ${businessKey} (${saved.recordType}${saved.stopWork ? ', stop-work' : ''}) for ${input.projectKey}.`);
    return saved;
  }

  /**
   * Update a record's monitoring fields. Append-only: supersedes the prior
   * current row (isCurrent=false) and inserts a new version that carries the
   * same business key, so the full safety history survives.
   */
  async updateRecord(id: string, patch: UpdateSafetyRecordInput): Promise<SafetyRecord> {
    const prior = await this.get(id);
    if (patch.recordType !== undefined && !RECORD_TYPES.includes(patch.recordType)) {
      throw new BadRequestException(`recordType must be one of: ${RECORD_TYPES.join(', ')}`);
    }
    if (patch.severity != null && !SEVERITIES.includes(patch.severity)) {
      throw new BadRequestException(`severity must be one of: ${SEVERITIES.join(', ')}`);
    }
    if (patch.status !== undefined && !STATUSES.includes(patch.status)) {
      throw new BadRequestException(`status must be one of: ${STATUSES.join(', ')}`);
    }

    prior.isCurrent = false;
    await this.records.save(prior);

    const next = await this.records.save(this.records.create({
      projectBusinessKey: prior.projectBusinessKey,
      businessKey: prior.businessKey,
      title: patch.title?.trim() ?? prior.title,
      recordType: patch.recordType ?? prior.recordType,
      severity: patch.severity !== undefined ? patch.severity : prior.severity,
      status: patch.status ?? prior.status,
      recordDate: patch.recordDate !== undefined ? patch.recordDate : prior.recordDate,
      stopWork: patch.stopWork !== undefined ? patch.stopWork : prior.stopWork,
      affectedActivityKeys: patch.affectedActivityKeys !== undefined ? cleanKeys(patch.affectedActivityKeys) : prior.affectedActivityKeys,
      eotDays: patch.eotDays !== undefined ? intOrNull(patch.eotDays) : prior.eotDays,
      details: patch.details !== undefined ? patch.details : prior.details,
      version: prior.version + 1,
      isCurrent: true,
      createdBy: prior.createdBy,
    }));
    this.logger.log(`Updated safety record ${prior.businessKey} → v${next.version} for ${prior.projectBusinessKey}.`);
    return next;
  }
}

const intOrNull = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null);
const cleanKeys = (keys: unknown): string[] | null => {
  if (!Array.isArray(keys)) return null;
  const out = keys.map((k) => String(k).trim()).filter((k) => k.length > 0);
  return out.length ? out : null;
};
