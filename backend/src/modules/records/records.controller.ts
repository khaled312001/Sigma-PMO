import { Body, Controller, Delete, Get, Headers, Param, Patch, UnauthorizedException } from '@nestjs/common';

import { User } from '../canonical/entities';
import { AuthService } from '../auth/auth.service';
import { RequiresCapability } from '../auth/require-capability.decorator';
import { RecordsService } from './records.service';

/**
 * Generic result-record management — delete or edit ANY result row (across every
 * page) through one reusable, tenant-safe, audited surface. Gated on the
 * governance-evaluation tier.
 */
@Controller('records')
export class RecordsController {
  constructor(
    private readonly svc: RecordsService,
    private readonly auth: AuthService,
  ) {}

  @Get('tables')
  @RequiresCapability('canRead')
  async tables(@Headers('x-api-key') rawKey?: string) {
    await this.caller(rawKey);
    return this.svc.listTables();
  }

  @Delete(':table/:id')
  @RequiresCapability('canEvaluateRules')
  async remove(@Param('table') table: string, @Param('id') id: string, @Headers('x-api-key') rawKey?: string) {
    return this.svc.deleteRecord(table, id, await this.caller(rawKey));
  }

  @Patch(':table/:id')
  @RequiresCapability('canEvaluateRules')
  async edit(@Param('table') table: string, @Param('id') id: string, @Headers('x-api-key') rawKey: string | undefined, @Body() body: Record<string, unknown>) {
    return this.svc.editRecord(table, id, body ?? {}, await this.caller(rawKey));
  }

  private async caller(rawKey?: string): Promise<User> {
    if (!rawKey) throw new UnauthorizedException('Missing x-api-key');
    const user = await this.auth.findActiveByApiKey(rawKey);
    if (!user) throw new UnauthorizedException('Invalid API key');
    return user;
  }
}
