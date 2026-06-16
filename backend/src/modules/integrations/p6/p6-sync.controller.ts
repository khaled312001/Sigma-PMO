import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { RequiresCapability } from '../../auth/require-capability.decorator';
import { IngestionOutcome } from '../../ingestion/ingestion.service';
import { P6ClientService, P6Status } from './p6-client.service';

interface SyncBody {
  projectId: string;
}

/**
 * `/integrations/p6` (live REST pull). Complements the inbound
 * `P6WebhookController` (file push) with an OUTBOUND pull from the client's
 * P6 EPPM REST server: `status` + `projects` are reads; `sync` triggers a live
 * import that runs through the standard ingestion pipeline.
 *
 * Needs ONLY the client's P6 base URL + database + username + password (set
 * encrypted at /admin/settings). With them blank the surface reports
 * `enabled:false` and P6 data keeps arriving via file upload / webhook.
 */
@Controller('integrations/p6')
export class P6SyncController {
  constructor(private readonly p6: P6ClientService) {}

  @Get('status')
  @RequiresCapability('canRead')
  status(@Query('probe') probe?: string): Promise<P6Status> {
    return this.p6.getStatus(probe === 'true' || probe === '1');
  }

  @Get('projects')
  @RequiresCapability('canRead')
  projects(): Promise<Array<{ objectId: string; id: string; name: string; status: string }>> {
    return this.p6.listProjects();
  }

  @Post('sync')
  @HttpCode(200)
  @Throttle({ ingest: { limit: 30, ttl: 60_000 } })
  @RequiresCapability('canIngest')
  sync(@Body() body: SyncBody): Promise<IngestionOutcome> {
    if (!body?.projectId) throw new BadRequestException('projectId is required');
    return this.p6.syncProject(body.projectId);
  }
}
