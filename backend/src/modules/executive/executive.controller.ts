import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { ExecutiveAgentService, ExecutivePack } from './executive-agent.service';

/**
 * `/executive` — the L7 Executive Intelligence surface (strategic KPIs +
 * governance headline). Read-only; the same pack the L7 agent emits.
 */
@Controller('executive')
export class ExecutiveController {
  constructor(private readonly executive: ExecutiveAgentService) {}

  @Get('overview')
  @RequiresCapability('canRead')
  overview(@Query('projectKey') projectKey?: string): Promise<ExecutivePack> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.executive.buildPack(projectKey);
  }
}
