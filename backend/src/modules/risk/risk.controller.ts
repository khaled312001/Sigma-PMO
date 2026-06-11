import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { Risk } from '../canonical/entities';
import { RiskAgentService } from './risk-agent.service';

/**
 * `/risk` — the L5 risk register surface (read). Generation happens by running
 * the `l5.risk` agent (POST /agents/l5.risk/run); this lists the result.
 */
@Controller('risk')
export class RiskController {
  constructor(private readonly riskAgent: RiskAgentService) {}

  @Get()
  @RequiresCapability('canRead')
  list(@Query('projectKey') projectKey?: string): Promise<Risk[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.riskAgent.list(projectKey);
  }
}
