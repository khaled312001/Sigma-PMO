import { Body, Controller, Get, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';

import { User } from '../canonical/entities';
import { AuthService } from '../auth/auth.service';
import { RequiresCapability } from '../auth/require-capability.decorator';
import { CommunicationRuleService } from './communication-rule.service';
import { CommunicationRulesConfig, DEFAULT_COMMUNICATION_RULES } from './communication-rules.config';

/**
 * Project communication RULES (Mr. Ayham, 2026-06-19). The project admin defines
 * the official channels, approved recipients/roles, unread-alert period, the
 * escalation matrix, required-acknowledgement + response categories, response SLA,
 * deemed-notice rules and the responsible party per category. Company-scoped +
 * versioned; reads need `canRead`, edits need `canEditPolicy`.
 */
@Controller('communication-rules')
export class CommunicationRuleController {
  constructor(
    private readonly rules: CommunicationRuleService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @RequiresCapability('canRead')
  async get(@Headers('x-api-key') rawKey?: string) {
    const caller = await this.caller(rawKey);
    const row = await this.rules.resolveRow(caller.companyId);
    const config = await this.rules.resolveFor(caller.companyId);
    return {
      config,
      configured: !!row && !!row.companyId,
      version: row?.version ?? 0,
      authoredBy: row?.authoredBy ?? null,
      updatedAt: row?.createdAt ?? null,
      defaults: DEFAULT_COMMUNICATION_RULES,
    };
  }

  @Post()
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  async save(@Headers('x-api-key') rawKey: string | undefined, @Body() body: Partial<CommunicationRulesConfig> & { updatedBy?: string }) {
    const caller = await this.caller(rawKey);
    const row = await this.rules.upsert(caller.companyId, body, body.updatedBy ?? caller.email);
    return { config: row.config, version: row.version, authoredBy: row.authoredBy, updatedAt: row.createdAt, configured: true };
  }

  @Get('versions')
  @RequiresCapability('canRead')
  async versions(@Headers('x-api-key') rawKey?: string) {
    const caller = await this.caller(rawKey);
    return this.rules.listVersions(caller.companyId);
  }

  private async caller(rawKey?: string): Promise<User> {
    if (!rawKey) throw new UnauthorizedException('Missing x-api-key');
    const user = await this.auth.findActiveByApiKey(rawKey);
    if (!user) throw new UnauthorizedException('Invalid API key');
    return user;
  }
}
