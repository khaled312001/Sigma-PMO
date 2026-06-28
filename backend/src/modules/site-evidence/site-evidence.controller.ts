import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { User } from '../canonical/entities';
import { SiteEvidence } from '../canonical/entities/site-evidence.entity';
import { SiteEvidenceService } from './site-evidence.service';
import type { CaptureEvidenceInput } from './site-evidence.service';

/**
 * `/site-evidence` — the smart-glasses / site-evidence capture channel
 * (Mr. Ayham acceptance 2026-06-28). `POST /capture` ingests a photo / video /
 * audio / transcript with rich metadata (gated `canIngest`); `GET ?projectKey=
 * &date=` lists a day's captures (the daily-report rollup) and `GET /:id`
 * returns one (both `canRead`).
 */
@Controller('site-evidence')
export class SiteEvidenceController {
  constructor(private readonly siteEvidence: SiteEvidenceService) {}

  @Post('capture')
  @HttpCode(200)
  @Throttle({ ingest: { limit: 60, ttl: 60_000 } })
  @RequiresCapability('canIngest')
  capture(
    @Body() body: Omit<CaptureEvidenceInput, 'capturedBy'>,
    @Req() req: { user?: User },
  ): Promise<SiteEvidence> {
    if (!body?.projectBusinessKey) throw new BadRequestException('projectBusinessKey is required');
    if (!body?.contentBase64) throw new BadRequestException('contentBase64 is required');
    return this.siteEvidence.capture({ ...body, capturedBy: req.user?.displayName ?? null });
  }

  @Get()
  @RequiresCapability('canRead')
  list(
    @Query('projectKey') projectKey?: string,
    @Query('date') date?: string,
  ): Promise<SiteEvidence[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.siteEvidence.list(projectKey, date || undefined);
  }

  @Get(':id')
  @RequiresCapability('canRead')
  get(@Param('id') id: string): Promise<SiteEvidence> {
    return this.siteEvidence.get(id);
  }
}
