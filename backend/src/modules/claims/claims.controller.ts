import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { Claim } from '../canonical/entities';
import { ClaimsAgentService } from './claims-agent.service';
import { ClaimsExtrasService } from './claims-extras.service';
import { ForensicDelayService } from './forensic-delay.service';

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
    private readonly forensic: ForensicDelayService,
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

  /**
   * Forensic delay analysis (Mr. Ayham acceptance #1) — as-planned vs as-built
   * overlay, float-to-completion driving-path isolation, windowing, concurrency
   * netting and a net time-supported EOT with an entitlement strength + WHY.
   */
  @Get('forensic-delay')
  @RequiresCapability('canRead')
  forensicDelay(@Query('projectKey') projectKey?: string) {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.forensic.analyse(projectKey);
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

  /**
   * Forensic evidence chain (Mr. Ayham acceptance 2026-06-28) — claim →
   * forensic delay → entitlement → FIDIC clause verdict → evidence legs
   * (letter + daily report + baseline/update + photo/video + BOQ line + FIDIC
   * clause), each source-ref'd back to the exact file / page / paragraph / sha256.
   */
  @Get(':id/chain')
  @RequiresCapability('canRead')
  chain(@Param('id') id: string) {
    return this.extras.forensicChain(id);
  }
}
