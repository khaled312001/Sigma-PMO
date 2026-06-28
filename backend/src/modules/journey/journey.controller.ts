import { BadRequestException, Controller, Get, Param } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { JourneyService } from './journey.service';
import type { JourneyChain } from './journey.service';

/**
 * `/journey` — the cross-module journey read surface (Mr. Ayham acceptance
 * 2026-06-28, "the one pipeline"). `GET /journey/:projectKey` assembles and
 * returns the ordered chain sketch → feasibility → BIM → BoQ → schedule →
 * contract → site-evidence → report → decision for a project businessKey.
 * Read-only.
 */
@Controller('journey')
export class JourneyController {
  constructor(private readonly journey: JourneyService) {}

  @Get(':projectKey')
  @RequiresCapability('canRead')
  chain(@Param('projectKey') projectKey: string): Promise<JourneyChain> {
    if (!projectKey) throw new BadRequestException('projectKey is required');
    return this.journey.chain(projectKey);
  }
}
