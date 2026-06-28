import { Controller, Get, Param, Query } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { Job, JobsPage, JobsService } from './jobs.service';

/**
 * `/jobs` — the unified workflow/job status surface (audit 2026-06-28). Returns
 * each execution's id + normalised status (queued/running/completed/failed) plus
 * a summary with the failure rate. Company-scoped, read-only.
 */
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  @RequiresCapability('canRead')
  list(@Query('limit') limit?: string): Promise<JobsPage> {
    return this.jobs.list(Number.parseInt(limit ?? '50', 10) || 50);
  }

  @Get(':id')
  @RequiresCapability('canRead')
  get(@Param('id') id: string): Promise<Job> {
    return this.jobs.get(id);
  }
}
