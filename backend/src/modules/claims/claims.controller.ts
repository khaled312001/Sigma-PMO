import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { Claim } from '../canonical/entities';
import { ClaimsAgentService } from './claims-agent.service';

/**
 * `/claims` — the L6 claims register surface (read). Identification happens by
 * running the `l6.claims` agent (POST /agents/l6.claims/run); this lists it.
 * Dispute-prep drafting stays on the existing /letters surface.
 */
@Controller('claims')
export class ClaimsController {
  constructor(private readonly claimsAgent: ClaimsAgentService) {}

  @Get()
  @RequiresCapability('canRead')
  list(@Query('projectKey') projectKey?: string): Promise<Claim[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.claimsAgent.list(projectKey);
  }
}
