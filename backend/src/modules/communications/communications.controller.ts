import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, UnauthorizedException } from '@nestjs/common';

import { User } from '../canonical/entities';
import { AuthService } from '../auth/auth.service';
import { RequiresCapability } from '../auth/require-capability.decorator';
import { CommunicationsService } from './communications.service';
import type { CreateCommDto } from './communications.service';

/**
 * Communication governance. Registers project communications/notices and tracks
 * their lifecycle with an AUTHENTICATED open-in-Sigma evidence trail — every
 * event (sent / opened / acknowledged / responded / escalated) is audited.
 */
@Controller('communications')
export class CommunicationsController {
  constructor(
    private readonly svc: CommunicationsService,
    private readonly auth: AuthService,
  ) {}

  @Post()
  @HttpCode(200)
  @RequiresCapability('canRead')
  async create(@Headers('x-api-key') rawKey: string | undefined, @Body() body: CreateCommDto) {
    return this.svc.create(body, await this.caller(rawKey));
  }

  @Get()
  @RequiresCapability('canRead')
  async list(@Headers('x-api-key') rawKey: string | undefined, @Query('projectKey') projectKey?: string) {
    return this.svc.list(await this.caller(rawKey), projectKey);
  }

  @Get('overdue')
  @RequiresCapability('canRead')
  async overdue(@Headers('x-api-key') rawKey?: string) {
    return this.svc.overdue(await this.caller(rawKey));
  }

  /** Opening inside Sigma records the authenticated open — the strong evidence. */
  @Get(':id')
  @RequiresCapability('canRead')
  async open(@Param('id') id: string, @Headers('x-api-key') rawKey?: string) {
    return this.svc.open(id, await this.caller(rawKey));
  }

  @Post(':id/acknowledge')
  @HttpCode(200)
  @RequiresCapability('canRead')
  async acknowledge(@Param('id') id: string, @Headers('x-api-key') rawKey?: string) {
    return this.svc.acknowledge(id, await this.caller(rawKey));
  }

  @Post(':id/respond')
  @HttpCode(200)
  @RequiresCapability('canRead')
  async respond(@Param('id') id: string, @Headers('x-api-key') rawKey: string | undefined, @Body() body: { decision: 'accepted' | 'rejected'; reply?: string }) {
    return this.svc.respond(id, await this.caller(rawKey), body);
  }

  @Post(':id/escalate')
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  async escalate(@Param('id') id: string, @Headers('x-api-key') rawKey?: string) {
    return this.svc.escalate(id, await this.caller(rawKey));
  }

  private async caller(rawKey?: string): Promise<User> {
    if (!rawKey) throw new UnauthorizedException('Missing x-api-key');
    const user = await this.auth.findActiveByApiKey(rawKey);
    if (!user) throw new UnauthorizedException('Invalid API key');
    return user;
  }
}
