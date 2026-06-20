import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { QualityRecord } from '../canonical/entities/quality-record.entity';

export interface CreateQualityRecordInput {
  projectKey: string;
  title: string;
  recordType: string;
  severity?: string | null;
  status?: string;
  recordDate?: string | null;
  disposition?: string | null;
  inspectionResult?: string | null;
  holdPoint?: boolean;
  witnessPoint?: boolean;
  blocksProgress?: boolean;
  affectedActivityKeys?: string[] | null;
  eotDays?: number | null;
  costImpact?: string | number | null;
  reinspectionOf?: string | null;
  details?: Record<string, unknown> | null;
  createdBy?: string | null;
}

export interface UpdateQualityRecordInput {
  title?: string;
  recordType?: string;
  severity?: string | null;
  status?: string;
  recordDate?: string | null;
  disposition?: string | null;
  inspectionResult?: string | null;
  holdPoint?: boolean;
  witnessPoint?: boolean;
  blocksProgress?: boolean;
  affectedActivityKeys?: string[] | null;
  eotDays?: number | null;
  costImpact?: string | number | null;
  reinspectionOf?: string | null;
  linkedClaimId?: string | null;
  details?: Record<string, unknown> | null;
}

const RECORD_TYPES = [
  'inspection_request',   // WIR
  'material_inspection',  // MIR
  'method_statement',
  'itp',
  'ncr',
  'corrective_action',
  'test_report',
];
const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'in_progress', 'closed'];
const DISPOSITIONS = ['rework', 'repair', 'use_as_is', 'reject'];
const RESULTS = ['pass', 'fail', 'conditional'];

/** Business-key prefix per record type. */
const PREFIX: Record<string, string> = {
  inspection_request: 'WIR',
  material_inspection: 'MIR',
  method_statement: 'MS',
  itp: 'ITP',
  ncr: 'NCR',
  corrective_action: 'CA',
  test_report: 'TR',
};

/**
 * QualityService — the QA/QC record store (Mr. Ayham acceptance #4). Plain,
 * append-only CRUD over QualityRecord with a typed business key per record type
 * (NCR-###, WIR-###, MIR-###, ITP-###, MS-###, CA-###, TR-###) scoped per
 * project. No quality mathematics here — that is QualityGovernanceService. Mirror
 * of SafetyService: an update supersedes the prior current row with an
 * incremented version so the full quality history survives.
 */
@Injectable()
export class QualityService {
  private readonly logger = new Logger(QualityService.name);

  constructor(
    @InjectRepository(QualityRecord) private readonly records: Repository<QualityRecord>,
  ) {}

  list(projectKey: string): Promise<QualityRecord[]> {
    if (!projectKey?.trim()) throw new BadRequestException('projectKey is required');
    return this.records.find({
      where: { projectBusinessKey: projectKey, isCurrent: true },
      order: { createdAt: 'DESC' },
    });
  }

  async get(id: string): Promise<QualityRecord> {
    const row = await this.records.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Quality record "${id}" not found`);
    return row;
  }

  async createRecord(input: CreateQualityRecordInput): Promise<QualityRecord> {
    if (!input?.projectKey?.trim()) throw new BadRequestException('projectKey is required');
    if (!input.title?.trim()) throw new BadRequestException('title is required');
    if (!RECORD_TYPES.includes(input.recordType)) {
      throw new BadRequestException(`recordType must be one of: ${RECORD_TYPES.join(', ')}`);
    }
    this.validateEnums(input);
    const status = input.status ?? 'open';
    if (!STATUSES.includes(status)) throw new BadRequestException(`status must be one of: ${STATUSES.join(', ')}`);

    // Sequence by record-type prefix among current rows for the project.
    const prefix = PREFIX[input.recordType];
    const existing = await this.records.count({
      where: { projectBusinessKey: input.projectKey, isCurrent: true, recordType: input.recordType },
    });
    const businessKey = `${prefix}-${String(existing + 1).padStart(3, '0')}`;

    const saved = await this.records.save(this.records.create({
      projectBusinessKey: input.projectKey,
      businessKey,
      title: input.title.trim(),
      recordType: input.recordType,
      severity: input.severity ?? null,
      status,
      recordDate: input.recordDate ?? null,
      disposition: input.disposition ?? null,
      inspectionResult: input.inspectionResult ?? null,
      holdPoint: input.holdPoint ?? false,
      witnessPoint: input.witnessPoint ?? false,
      blocksProgress: input.blocksProgress ?? false,
      affectedActivityKeys: cleanKeys(input.affectedActivityKeys),
      eotDays: intOrNull(input.eotDays),
      costImpact: decOrNull(input.costImpact),
      reinspectionOf: input.reinspectionOf ?? null,
      linkedClaimId: null,
      details: input.details ?? null,
      version: 1,
      isCurrent: true,
      createdBy: input.createdBy ?? null,
    }));
    this.logger.log(`Created quality record ${businessKey} (${saved.recordType}${saved.blocksProgress ? ', blocking' : ''}) for ${input.projectKey}.`);
    return saved;
  }

  async updateRecord(id: string, patch: UpdateQualityRecordInput): Promise<QualityRecord> {
    const prior = await this.get(id);
    if (patch.recordType !== undefined && !RECORD_TYPES.includes(patch.recordType)) {
      throw new BadRequestException(`recordType must be one of: ${RECORD_TYPES.join(', ')}`);
    }
    this.validateEnums(patch);
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
      disposition: patch.disposition !== undefined ? patch.disposition : prior.disposition,
      inspectionResult: patch.inspectionResult !== undefined ? patch.inspectionResult : prior.inspectionResult,
      holdPoint: patch.holdPoint !== undefined ? patch.holdPoint : prior.holdPoint,
      witnessPoint: patch.witnessPoint !== undefined ? patch.witnessPoint : prior.witnessPoint,
      blocksProgress: patch.blocksProgress !== undefined ? patch.blocksProgress : prior.blocksProgress,
      affectedActivityKeys: patch.affectedActivityKeys !== undefined ? cleanKeys(patch.affectedActivityKeys) : prior.affectedActivityKeys,
      eotDays: patch.eotDays !== undefined ? intOrNull(patch.eotDays) : prior.eotDays,
      costImpact: patch.costImpact !== undefined ? decOrNull(patch.costImpact) : prior.costImpact,
      reinspectionOf: patch.reinspectionOf !== undefined ? patch.reinspectionOf : prior.reinspectionOf,
      linkedClaimId: patch.linkedClaimId !== undefined ? patch.linkedClaimId : prior.linkedClaimId,
      details: patch.details !== undefined ? patch.details : prior.details,
      version: prior.version + 1,
      isCurrent: true,
      createdBy: prior.createdBy,
    }));
    this.logger.log(`Updated quality record ${prior.businessKey} → v${next.version} for ${prior.projectBusinessKey}.`);
    return next;
  }

  private validateEnums(p: { severity?: string | null; disposition?: string | null; inspectionResult?: string | null }): void {
    if (p.severity != null && !SEVERITIES.includes(p.severity)) throw new BadRequestException(`severity must be one of: ${SEVERITIES.join(', ')}`);
    if (p.disposition != null && !DISPOSITIONS.includes(p.disposition)) throw new BadRequestException(`disposition must be one of: ${DISPOSITIONS.join(', ')}`);
    if (p.inspectionResult != null && !RESULTS.includes(p.inspectionResult)) throw new BadRequestException(`inspectionResult must be one of: ${RESULTS.join(', ')}`);
  }
}

const intOrNull = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null);
const decOrNull = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number.parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n.toFixed(2) : null;
};
const cleanKeys = (keys: unknown): string[] | null => {
  if (!Array.isArray(keys)) return null;
  const out = keys.map((k) => String(k).trim()).filter((k) => k.length > 0);
  return out.length ? out : null;
};
