import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, UnauthorizedException } from '@nestjs/common';

import { User } from '../canonical/entities';
import { AuthService } from '../auth/auth.service';
import { RequiresCapability } from '../auth/require-capability.decorator';
import { EvidenceService } from './evidence.service';
import type { CreateRoomDto, RawFile } from './evidence.service';
import type { EvidenceLimits } from './evidence.config';

/**
 * Evidence Memory / Dispute Data Room. Scalable, source-verifiable evidence
 * repository for disputes, claims and completed-project analysis. Batch upload +
 * background staged processing; capacity is raisable on demand by an admin.
 */
@Controller('evidence')
export class EvidenceController {
  constructor(
    private readonly svc: EvidenceService,
    private readonly auth: AuthService,
  ) {}

  @Post('rooms')
  @HttpCode(200)
  @RequiresCapability('canIngestSchedule')
  async createRoom(@Headers('x-api-key') rawKey: string | undefined, @Body() body: CreateRoomDto) {
    return this.svc.createRoom(body, await this.caller(rawKey));
  }

  @Get('rooms')
  @RequiresCapability('canRead')
  async listRooms(@Headers('x-api-key') rawKey: string | undefined, @Query('projectKey') projectKey?: string) {
    return this.svc.listRooms(await this.caller(rawKey), projectKey);
  }

  @Get('rooms/:id')
  @RequiresCapability('canRead')
  async getRoom(@Param('id') id: string, @Headers('x-api-key') rawKey?: string) {
    return this.svc.getRoom(id, await this.caller(rawKey));
  }

  /** Batch upload — accepts many files at once. */
  @Post('rooms/:id/files')
  @HttpCode(200)
  @RequiresCapability('canIngestSchedule')
  async addFiles(@Param('id') id: string, @Headers('x-api-key') rawKey: string | undefined, @Body() body: { files: RawFile[] }) {
    return this.svc.addFiles(id, body?.files ?? [], await this.caller(rawKey));
  }

  /** Raise this room's capacity on demand (admin-tier; audited). */
  @Post('rooms/:id/limits')
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  async raiseLimit(@Param('id') id: string, @Headers('x-api-key') rawKey: string | undefined, @Body() body: Partial<EvidenceLimits>) {
    return this.svc.raiseLimit(id, body, await this.caller(rawKey));
  }

  /** Manually advance the pipeline (e.g. after raising a limit). */
  @Post('rooms/:id/process')
  @HttpCode(200)
  @RequiresCapability('canIngestSchedule')
  async process(@Param('id') id: string, @Headers('x-api-key') rawKey?: string) {
    return this.svc.process(id, await this.caller(rawKey));
  }

  @Get('rooms/:id/files-list')
  @RequiresCapability('canRead')
  async files(@Param('id') id: string, @Headers('x-api-key') rawKey?: string) {
    return this.svc.listFiles(id, await this.caller(rawKey));
  }

  @Get('rooms/:id/items')
  @RequiresCapability('canRead')
  async items(@Param('id') id: string, @Headers('x-api-key') rawKey: string | undefined, @Query('type') type?: string) {
    return this.svc.listItems(id, await this.caller(rawKey), type);
  }

  @Get('rooms/:id/timeline')
  @RequiresCapability('canRead')
  async timeline(@Param('id') id: string, @Headers('x-api-key') rawKey?: string) {
    return this.svc.timeline(id, await this.caller(rawKey));
  }

  @Get('rooms/:id/files/:fileId/chunks')
  @RequiresCapability('canRead')
  async chunks(@Param('id') id: string, @Param('fileId') fileId: string, @Headers('x-api-key') rawKey?: string) {
    return this.svc.fileChunks(id, fileId, await this.caller(rawKey));
  }

  /** Human review — decide on findings before commit. */
  @Post('rooms/:id/decide')
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  async decide(@Param('id') id: string, @Headers('x-api-key') rawKey: string | undefined, @Body() body: { decisions: Array<{ id: string; decision: 'confirm' | 'correct' | 'exclude'; correctedValue?: string }> }) {
    return this.svc.decide(id, body?.decisions ?? [], await this.caller(rawKey));
  }

  /** Commit confirmed findings to canonical records with provenance. */
  @Post('rooms/:id/commit')
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  async commit(@Param('id') id: string, @Headers('x-api-key') rawKey?: string) {
    return this.svc.commit(id, await this.caller(rawKey));
  }

  private async caller(rawKey?: string): Promise<User> {
    if (!rawKey) throw new UnauthorizedException('Missing x-api-key');
    const user = await this.auth.findActiveByApiKey(rawKey);
    if (!user) throw new UnauthorizedException('Invalid API key');
    return user;
  }
}
