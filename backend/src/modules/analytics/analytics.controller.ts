import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { HierarchyLevel } from '../../common/enums';
import { RequiresCapability } from '../auth/require-capability.decorator';
import { AnalyticsAgentService } from './analytics-agent.service';

/**
 * `/analytics` — the L4 Analytics surface (EVM + productivity + forecast +
 * portfolio roll-up). Read-only (`canRead`); the deterministic computation is
 * the same one the L4 agent runs.
 */
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsAgentService) {}

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
    throw new BadRequestException('programKey or portfolioKey query parameter is required');
  }
}
