import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { BaselineBuildJob } from '../canonical/entities';
import { BaselineBuildService, DEFAULT_PLANNER_PERSONA_SLUG } from './baseline-build.service';

interface SubmitBaselineJobBody {
  projectKey: string;
  drawingsSourceFileIds: string[];
  personaSlug?: string;
}

/**
 * Baseline build surface (post-meeting plan §3.1, ADR-0011).
 *
 * Wave 2 ships the stub: submissions are accepted, persisted as
 * `awaiting-enablement`, and listed/fetched. The real Computer Use driver is
 * Wave 3+ and stays dark behind this surface until ADR-0011 is Accepted.
 *
 * Writes require `canSimulate` (any role that may fork a Scenario may also
 * queue a baseline build — contractor remains read-only here). Reads follow
 * the standard `canRead` gate.
 */
@Controller('baselines')
export class BaselinesController {
  constructor(private readonly baselines: BaselineBuildService) {}

  @Post('jobs')
  @HttpCode(200)
  @RequiresCapability('canSimulate')
  submit(@Body() body: SubmitBaselineJobBody): Promise<BaselineBuildJob> {
    if (!body?.projectKey) {
      throw new BadRequestException('projectKey is required');
    }
    if (!Array.isArray(body?.drawingsSourceFileIds)) {
      throw new BadRequestException('drawingsSourceFileIds must be an array');
    }
    return this.baselines.submitJob(
      body.projectKey,
      body.drawingsSourceFileIds,
      body.personaSlug ?? DEFAULT_PLANNER_PERSONA_SLUG,
    );
  }

  @Get('jobs')
  @RequiresCapability('canRead')
  list(@Query('projectKey') projectKey?: string): Promise<BaselineBuildJob[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.baselines.listJobs(projectKey);
  }

  @Get('jobs/:id')
  @RequiresCapability('canRead')
  get(@Param('id') id: string): Promise<BaselineBuildJob> {
    return this.baselines.getJob(id);
  }
}
