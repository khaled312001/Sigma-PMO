import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { Claim } from '../canonical/entities';
import { ClaimsAgentService } from './claims-agent.service';
import { ClaimsExtrasService } from './claims-extras.service';

/**
 * `/claims` — the L6 claims register surface (read). Identification happens by
 * running the `l6.claims` agent (POST /agents/l6.claims/run); this lists it.
 * Dispute-prep drafting stays on the existing /letters surface.
 */
@Controller('claims')
export class ClaimsController {
  constructor(
    private readonly claimsAgent: ClaimsAgentService,
    private readonly extras: ClaimsExtrasService,
  ) {}

  @Get()
  @RequiresCapability('canRead')
  list(@Query('projectKey') projectKey?: string): Promise<Claim[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.claimsAgent.list(projectKey);
  }

  /** Deterministic entitlement screening for every claim on a project. */
  @Get('entitlement')
  @RequiresCapability('canRead')
  entitlement(@Query('projectKey') projectKey?: string) {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.extras.entitlementList(projectKey);
  }

  /** Readiness score (0–100) for one claim with a named breakdown. */
  @Get(':id/readiness')
  @RequiresCapability('canRead')
  readiness(@Param('id') id: string) {
    return this.extras.readiness(id);
  }

  /** Evidence-linked claim package JSON for dispute preparation. */
  @Get(':id/package')
  @RequiresCapability('canRead')
  claimPackage(@Param('id') id: string) {
    return this.extras.claimPackage(id);
  }
}
