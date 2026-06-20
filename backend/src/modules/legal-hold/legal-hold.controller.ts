import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { User } from '../canonical/entities';
import { CustodyEvent } from './custody-event.entity';
import { LegalHold } from './legal-hold.entity';
import { LegalHoldService } from './legal-hold.service';

/**
 * `/legal-holds` — preservation holds + chain-of-custody (Mr. Ayham acceptance
 * #6/#12). Placing a hold is governance-tier (`canEvaluateRules`); releasing one
 * is high-privilege (`canEditPolicy`) and audited; reads on `canRead`. While a
 * target is held, the generic delete path refuses to hard-delete it.
 */
@Controller('legal-holds')
export class LegalHoldController {
  constructor(private readonly svc: LegalHoldService) {}

  @Get()
  @RequiresCapability('canRead')
  list(@Query('projectKey') projectKey?: string): Promise<LegalHold[]> {
    return this.svc.listHolds(projectKey || undefined);
  }

  @Get('custody')
  @RequiresCapability('canRead')
  custody(
    @Query('targetTable') targetTable?: string,
    @Query('targetId') targetId?: string,
    @Query('projectKey') projectKey?: string,
  ): Promise<CustodyEvent[]> {
    return this.svc.listCustody(targetTable || undefined, targetId || undefined, projectKey || undefined);
  }

  @Post()
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  place(
    @Body() body: { targetTable: string; targetId: string; reason: string; projectKey?: string; targetLabel?: string; matterRef?: string },
    @Req() req: { user?: User },
  ): Promise<LegalHold> {
    if (!body?.targetTable || !body?.targetId) throw new BadRequestException('targetTable and targetId are required');
    return this.svc.placeHold({
      targetTable: body.targetTable,
      targetId: body.targetId,
      reason: body.reason,
      projectBusinessKey: body.projectKey ?? null,
      targetLabel: body.targetLabel ?? null,
      matterRef: body.matterRef ?? null,
      placedByEmail: req.user?.email ?? null,
    });
  }

  @Post(':id/release')
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  release(@Param('id') id: string, @Body() body: { reason?: string }, @Req() req: { user?: User }): Promise<LegalHold> {
    return this.svc.releaseHold(id, req.user?.email ?? null, body?.reason ?? null);
  }
}
