import { BadRequestException, Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { User } from '../canonical/entities';
import { AuthorityMatrixEntry } from '../canonical/entities/authority-matrix-entry.entity';
import { AuthorityMatrixService } from './authority-matrix.service';
import type { AuthorityCheckInput, AuthorityCheckResult, CreateAuthorityEntryInput } from './authority-matrix.service';

/**
 * `/authority-matrix` — the Contractual Authority Matrix (Mr. Ayham acceptance
 * #10). Defines who may perform which contractual actions per project, and
 * checks whether a given issuer is duly authorized (with the contractual effect
 * when not). Management is gated on `canEditPolicy`; reads + checks on `canRead`.
 */
@Controller('authority-matrix')
export class AuthorityMatrixController {
  constructor(private readonly svc: AuthorityMatrixService) {}

  @Get('actions')
  @RequiresCapability('canRead')
  actions(): { actions: readonly string[] } {
    return { actions: this.svc.actions() };
  }

  @Get()
  @RequiresCapability('canRead')
  list(@Query('projectKey') projectKey?: string): Promise<AuthorityMatrixEntry[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.svc.list(projectKey);
  }

  @Post()
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  create(@Body() body: Omit<CreateAuthorityEntryInput, 'createdBy'>, @Req() req: { user?: User }): Promise<AuthorityMatrixEntry> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    return this.svc.createEntry({ ...body, createdBy: req.user?.displayName ?? null });
  }

  @Patch(':id')
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  update(@Param('id') id: string, @Body() body: Partial<CreateAuthorityEntryInput> & { status?: string }): Promise<AuthorityMatrixEntry> {
    return this.svc.updateEntry(id, body);
  }

  @Post('check')
  @HttpCode(200)
  @RequiresCapability('canRead')
  check(@Body() body: AuthorityCheckInput): Promise<AuthorityCheckResult> {
    if (!body?.projectKey || !body?.action) throw new BadRequestException('projectKey and action are required');
    return this.svc.check(body);
  }
}
