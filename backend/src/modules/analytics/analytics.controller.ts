import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { HierarchyLevel } from '../../common/enums';
import { RequiresCapability } from '../auth/require-capability.decorator';
import { AnalyticsAgentService } from './analytics-agent.service';
import { AnalyticsExtrasService } from './analytics-extras.service';

/**
 * `/analytics` — the L4 Analytics surface (EVM + productivity + forecast +
 * portfolio roll-up). Read-only (`canRead`); the deterministic computation is
 * the same one the L4 agent runs.
 */
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsAgentService,
    private readonly extras: AnalyticsExtrasService,
  ) {}

  @Get('evm')
  @RequiresCapability('canRead')
  evm(@Query('projectKey') projectKey?: string) {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.analytics.computeProject(projectKey);
  }

  @Get('portfolio')
  @RequiresCapability('canRead')
  portfolio(
    @Query('programKey') programKey?: string,
    @Query('portfolioKey') portfolioKey?: string,
  ) {
    if (programKey) return this.analytics.computePortfolio(programKey, HierarchyLevel.PROGRAM);
    if (portfolioKey) return this.analytics.computePortfolio(portfolioKey, HierarchyLevel.PORTFOLIO);
    // No program/portfolio key → whole-estate roll-up across every current project.
    return this.extras.portfolio();
  }

  /** Earned Schedule (time-based forecasting) for one project. */
  @Get('earned-schedule')
  @RequiresCapability('canRead')
  earnedSchedule(@Query('projectKey') projectKey?: string) {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.extras.earnedSchedule(projectKey);
  }

  /** SPI/CPI trends from the append-only analytics-snapshot history. */
  @Get('trends')
  @RequiresCapability('canRead')
  trends(@Query('projectKey') projectKey?: string) {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.extras.trends(projectKey);
  }
}
