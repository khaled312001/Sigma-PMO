import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { Scenario } from '../canonical/entities';
import { SimulationService } from './simulation.service';

interface ForkScenarioBody {
  projectBusinessKey: string;
  name: string;
  authorUserId?: string | null;
  authorDisplay?: string | null;
  summary?: string;
}

/**
 * Sandbox simulation surface (ADR-0010, post-meeting plan §3.4).
 *
 * All write endpoints require `canSimulate` — Wave 1 grants this to every
 * role except contractor. Read endpoints follow the standard `canRead` gate.
 */
@Controller('simulation')
export class SimulationController {
  constructor(private readonly simulation: SimulationService) {}

  @Post('scenarios')
  @HttpCode(200)
  @RequiresCapability('canSimulate')
  fork(@Body() body: ForkScenarioBody): Promise<Scenario> {
    if (!body?.projectBusinessKey || !body?.name) {
      throw new BadRequestException('projectBusinessKey and name are required');
    }
    return this.simulation.fork(
      body.projectBusinessKey,
      body.name,
      body.authorUserId ?? null,
      body.authorDisplay ?? null,
      body.summary ?? '',
    );
  }

  @Get('scenarios')
  @RequiresCapability('canRead')
  list(@Query('projectKey') projectKey?: string): Promise<Scenario[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.simulation.listScenarios(projectKey);
  }

  @Post('scenarios/:id/discard')
  @HttpCode(200)
  @RequiresCapability('canSimulate')
  async discard(@Param('id') id: string): Promise<{ status: 'discarded' }> {
    await this.simulation.discard(id);
    return { status: 'discarded' };
  }
}
