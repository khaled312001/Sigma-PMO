import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { Risk } from '../canonical/entities';
import { RiskAgentService } from './risk-agent.service';
import { RiskExtrasService } from './risk-extras.service';

/**
 * `/risk` — the L5 risk register surface (read). Generation happens by running
 * the `l5.risk` agent (POST /agents/l5.risk/run); this lists the result.
 */
@Controller('risk')
export class RiskController {
  constructor(
    private readonly riskAgent: RiskAgentService,
    private readonly extras: RiskExtrasService,
  ) {}

  @Get()
  @RequiresCapability('canRead')
  list(@Query('projectKey') projectKey?: string): Promise<Risk[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.riskAgent.list(projectKey);
  }

  /** Open risks each with 2–3 matched mitigation options (deterministic). */
  @Get('mitigations')
  @RequiresCapability('canRead')
  mitigations(@Query('projectKey') projectKey?: string) {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.extras.mitigations(projectKey);
  }

  /** Pairwise category co-occurrence + shared-signal clusters for one project. */
  @Get('correlation')
  @RequiresCapability('canRead')
  correlation(@Query('projectKey') projectKey?: string) {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.extras.correlation(projectKey);
  }

  /** Whole-estate risk roll-up grouped by portfolio + program. */
  @Get('portfolio')
  @RequiresCapability('canRead')
  portfolio() {
    return this.extras.portfolio();
  }
}
