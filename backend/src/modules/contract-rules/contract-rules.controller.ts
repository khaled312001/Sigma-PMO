import { BadRequestException, Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { User } from '../canonical/entities';
import { ContractClauseRule } from '../canonical/entities/contract-clause-rule.entity';
import { ContractRulesService } from './contract-rules.service';
import type { CreateClauseRuleInput, EvaluateInput } from './contract-rules.service';

/**
 * `/contract-rules` — the Contract Rules Engine (Mr. Ayham acceptance #2): the
 * per-project clause-rule register (notice / time bar / response period / deemed
 * approval / determination), a FIDIC seed, and the deterministic evaluators that
 * test facts against the contract (preserved / weak / time-barred) and lay out
 * the procedural lifecycle clock. Management gated on `canEditPolicy`; reads +
 * evaluation on `canRead`.
 */
@Controller('contract-rules')
export class ContractRulesController {
  constructor(private readonly svc: ContractRulesService) {}

  @Get('presets')
  @RequiresCapability('canRead')
  presets() {
    return { presets: this.svc.presets() };
  }

  @Get()
  @RequiresCapability('canRead')
  list(@Query('projectKey') projectKey?: string): Promise<ContractClauseRule[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.svc.list(projectKey);
  }

  @Post()
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  create(@Body() body: Omit<CreateClauseRuleInput, 'createdBy'>, @Req() req: { user?: User }): Promise<ContractClauseRule> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    return this.svc.createRule({ ...body, createdBy: req.user?.displayName ?? null });
  }

  @Patch(':id')
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  update(@Param('id') id: string, @Body() body: Partial<CreateClauseRuleInput> & { status?: string }): Promise<ContractClauseRule> {
    return this.svc.updateRule(id, body);
  }

  @Post('apply-preset')
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  applyPreset(@Body() body: { projectKey: string; presetKey: string }, @Req() req: { user?: User }) {
    if (!body?.projectKey || !body?.presetKey) throw new BadRequestException('projectKey and presetKey are required');
    return this.svc.applyPreset(body.projectKey, body.presetKey, req.user?.displayName ?? null);
  }

  @Post('evaluate')
  @HttpCode(200)
  @RequiresCapability('canRead')
  evaluate(@Body() body: EvaluateInput) {
    if (!body?.eventDate || body?.daysToAct == null) throw new BadRequestException('eventDate and daysToAct are required');
    return this.svc.evaluate(body);
  }

  @Get('matter-clock')
  @RequiresCapability('canRead')
  matterClock(@Query('projectKey') projectKey?: string, @Query('eventDate') eventDate?: string, @Query('asOf') asOf?: string) {
    if (!projectKey || !eventDate) throw new BadRequestException('projectKey and eventDate are required');
    return this.svc.matterClock(projectKey, eventDate, asOf);
  }

  @Get('project-claims')
  @RequiresCapability('canRead')
  projectClaims(@Query('projectKey') projectKey?: string, @Query('asOf') asOf?: string) {
    if (!projectKey) throw new BadRequestException('projectKey is required');
    return this.svc.evaluateProjectClaims(projectKey, asOf);
  }
}
