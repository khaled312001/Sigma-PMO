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

  /** Run the unread-alert + matrix-escalation sweep for the caller's company. */
  @Post('run-alerts')
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  async runAlerts(@Headers('x-api-key') rawKey?: string) {
    return this.svc.runAlerts(await this.caller(rawKey));
  }

  /** Opening inside Sigma records the authenticated open — the strong evidence. */
  @Get(':id')
  @RequiresCapability('canRead')
  async open(@Param('id') id: string, @Headers('x-api-key') rawKey?: string) {
    return this.svc.open(id, await this.caller(rawKey));
  }

  /** The full audit-event trail for one communication (the audit-log reference). */
  @Get(':id/audit')
  @RequiresCapability('canRead')
  async auditTrail(@Param('id') id: string, @Headers('x-api-key') rawKey?: string) {
    return this.svc.auditTrail(id, await this.caller(rawKey));
  }

  /** Viewing an attachment — distinct, stronger evidence than merely opening. */
  @Post(':id/attachment-viewed')
  @HttpCode(200)
  @RequiresCapability('canRead')
  async viewAttachment(@Param('id') id: string, @Headers('x-api-key') rawKey?: string) {
    return this.svc.viewAttachment(id, await this.caller(rawKey));
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

  /** Record that the required action was completed (close-out evidence). */
  @Post(':id/complete-action')
  @HttpCode(200)
  @RequiresCapability('canRead')
  async completeAction(@Param('id') id: string, @Headers('x-api-key') rawKey?: string) {
    return this.svc.completeAction(id, await this.caller(rawKey));
  }

  /** Record that no action was taken (deliberate-inaction evidence). */
  @Post(':id/no-action')
  @HttpCode(200)
  @RequiresCapability('canRead')
  async noAction(@Param('id') id: string, @Headers('x-api-key') rawKey: string | undefined, @Body() body?: { reason?: string }) {
    return this.svc.noAction(id, await this.caller(rawKey), body?.reason);
  }

  /** A party formally disputes the communication or its receipt. */
  @Post(':id/dispute')
  @HttpCode(200)
  @RequiresCapability('canRead')
  async dispute(@Param('id') id: string, @Headers('x-api-key') rawKey: string | undefined, @Body() body?: { reason?: string }) {
    return this.svc.dispute(id, await this.caller(rawKey), body?.reason);
  }

  /** Link the communication to a claim / approval / delay / risk record. */
  @Post(':id/link')
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  async link(@Param('id') id: string, @Headers('x-api-key') rawKey: string | undefined, @Body() body: { linkedClaimKey?: string | null; linkedRecordKey?: string | null }) {
    return this.svc.link(id, await this.caller(rawKey), body);
  }

  @Post(':id/escalate')
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  async escalate(@Param('id') id: string, @Headers('x-api-key') rawKey: string | undefined, @Body() body?: { toRole?: string }) {
    return this.svc.escalate(id, await this.caller(rawKey), body?.toRole);
  }

  private async caller(rawKey?: string): Promise<User> {
    if (!rawKey) throw new UnauthorizedException('Missing x-api-key');
    const user = await this.auth.findActiveByApiKey(rawKey);
    if (!user) throw new UnauthorizedException('Invalid API key');
    return user;
  }
}
