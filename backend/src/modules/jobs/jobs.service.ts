import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { IngestionStatus } from '../../common/enums';
import { companyScope } from '../../common/tenant/tenant-context';
import { IngestionRun } from '../canonical/entities';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface Job {
  id: string;
  type: 'ingestion';
  label: string;
  status: JobStatus;
  rawStatus: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  rowCounts?: Record<string, number>;
  error?: string | null;
}

export interface JobsPage {
  jobs: Job[];
  summary: { total: number; queued: number; running: number; completed: number; failed: number; failureRatePct: number };
}

/**
 * Unified read-only view over the platform's execution records (audit 2026-06-28,
 * item #4: "a unified workflow endpoint returning a job id + status
 * queued/running/completed/failed" + item #8: workflow failure rate). v1 surfaces
 * ingestion runs — the primary file→records workflow — normalised to a common
 * Job shape, company-scoped. Agent executions remain available under /agents.
 */
@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(IngestionRun) private readonly runs: Repository<IngestionRun>,
  ) {}

  private mapStatus(s: IngestionStatus | string): JobStatus {
    switch (s) {
      case IngestionStatus.PENDING: return 'queued';
      case IngestionStatus.PARSED:
      case IngestionStatus.VALIDATED: return 'running';
      case IngestionStatus.NORMALIZED: return 'completed';
      case IngestionStatus.FAILED: return 'failed';
      default: return 'running';
    }
  }

  private toJob(r: IngestionRun): Job {
    const summary = (r.summary ?? {}) as { error?: string; validation?: { errorCount?: number } };
    return {
      id: r.id,
      type: 'ingestion',
      label: r.parser,
      status: this.mapStatus(r.status),
      rawStatus: r.status,
      startedAt: r.startedAt ? r.startedAt.toISOString() : null,
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      rowCounts: (r.rowCounts ?? {}) as Record<string, number>,
      error: summary.error ?? null,
    };
  }

  async list(limit = 50): Promise<JobsPage> {
    const take = Math.min(Math.max(limit, 1), 200);
    const rows = await this.runs.find({ where: { ...companyScope() }, order: { createdAt: 'DESC' }, take });
    const jobs = rows.map((r) => this.toJob(r));
    const by = (s: JobStatus) => jobs.filter((j) => j.status === s).length;
    const completed = by('completed');
    const failed = by('failed');
    const settled = completed + failed;
    return {
      jobs,
      summary: {
        total: jobs.length,
        queued: by('queued'),
        running: by('running'),
        completed,
        failed,
        failureRatePct: settled > 0 ? Math.round((failed / settled) * 100) : 0,
      },
    };
  }

  async get(id: string): Promise<Job> {
    const r = await this.runs.findOne({ where: { id, ...companyScope() } });
    if (!r) throw new NotFoundException('Job not found');
    return this.toJob(r);
  }
}
