import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ProjectRecord } from '../canonical/entities';
import type { ProjectRecordType } from '../canonical/entities/project-record.entity';

const RECORD_TYPES: ProjectRecordType[] = [
  'rfi', 'submittal', 'ncr', 'change-request',
  'procurement-log', 'resource-log', 'cost-report', 'site-photo', 'other',
];

export interface IngestRecordInput {
  projectBusinessKey: string;
  recordType: string;
  refNumber: string;
  title: string;
  status?: string | null;
  party?: string | null;
  raisedDate?: string | null;
  dueDate?: string | null;
  amount?: number | string | null;
  details?: Record<string, unknown>;
}

/**
 * ProjectRecordService — the L1 Data Collection write/read path for the new
 * record families. Append-only versioned by (projectBusinessKey + refNumber):
 * re-ingesting the same ref bumps the version and flips isCurrent, exactly like
 * the rest of the canonical model.
 */
@Injectable()
export class ProjectRecordService {
  constructor(
    @InjectRepository(ProjectRecord) private readonly records: Repository<ProjectRecord>,
  ) {}

  async ingest(input: IngestRecordInput): Promise<ProjectRecord> {
    if (!input.projectBusinessKey?.trim()) throw new BadRequestException('projectBusinessKey is required');
    if (!RECORD_TYPES.includes(input.recordType as ProjectRecordType)) {
      throw new BadRequestException(`recordType must be one of: ${RECORD_TYPES.join(', ')}`);
    }
    if (!input.refNumber?.trim()) throw new BadRequestException('refNumber is required');
    if (!input.title?.trim()) throw new BadRequestException('title is required');

    const businessKey = `${input.projectBusinessKey}:${input.refNumber.trim()}`;
    const prior = await this.records.findOne({ where: { businessKey, isCurrent: true } });
    if (prior) {
      prior.isCurrent = false;
      await this.records.save(prior);
    }
    const version = prior ? prior.version + 1 : 1;

    return this.records.save(
      this.records.create({
        businessKey,
        version,
        isCurrent: true,
        rawSource: { source: 'l1-data-collection', input: input as unknown as Record<string, unknown> },
        ingestionRunId: `l1-record-${businessKey}-v${version}`,
        sourceFileId: 'l1-record',
        projectBusinessKey: input.projectBusinessKey,
        recordType: input.recordType,
        refNumber: input.refNumber.trim(),
        title: input.title.trim(),
        status: input.status ?? null,
        party: input.party ?? null,
        raisedDate: input.raisedDate ?? null,
        dueDate: input.dueDate ?? null,
        amount: input.amount === null || input.amount === undefined ? null : String(input.amount),
        details: input.details ?? {},
      }),
    );
  }

  list(projectBusinessKey: string, recordType?: string): Promise<ProjectRecord[]> {
    const where: Record<string, unknown> = { projectBusinessKey, isCurrent: true };
    if (recordType) where.recordType = recordType;
    return this.records.find({ where, order: { createdAt: 'DESC' } });
  }

  async inventory(projectBusinessKey: string): Promise<Record<string, number>> {
    const rows = await this.records.find({ where: { projectBusinessKey, isCurrent: true } });
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.recordType] = (counts[r.recordType] ?? 0) + 1;
    return counts;
  }

  static readonly TYPES = RECORD_TYPES;
}
