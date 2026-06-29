import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { GovernanceDashboardService } from './governance-dashboard.service';
import type { GovernanceDashboard } from './governance-dashboard.service';
import { GovernanceDashboardDto } from './dto/governance-dashboard.dto';

/**
 * `GET /executive/governance-dashboard?projectKey=` — a READ-ONLY per-project
 * governance view (Mr. Ayham acceptance 2026-06-28): source inputs → outputs →
 * evidence → human approval → the recommended decision, with
 * `recommendedDecision.requiresHumanApproval` always true. Strictly read-only:
 * the platform recommends; a human decides. Nothing is auto-approved.
 */
@ApiTags('executive: governance-dashboard')
@Controller('executive')
export class GovernanceDashboardController {
  constructor(private readonly dashboard: GovernanceDashboardService) {}

  @Get('governance-dashboard')
  @RequiresCapability('canRead')
  @ApiQuery({ name: 'projectKey', description: 'Project business key.', example: 'P-1000' })
  @ApiResponse({ status: 200, type: GovernanceDashboardDto, description: 'Read-only per-project governance view; recommendedDecision.requiresHumanApproval is always true.' })
  governanceDashboard(@Query('projectKey') projectKey?: string): Promise<GovernanceDashboard> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.dashboard.build(projectKey);
  }
}
