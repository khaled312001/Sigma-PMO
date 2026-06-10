import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { ProjectPolicyAddon } from '../canonical/entities';
import { PolicyAddonsService } from './policy-addons.service';

interface CreateAddonBody {
  projectKey: string;
  surface: string;
  content: string;
  authoredBy?: string | null;
  authoredByRole?: string | null;
}

/**
 * `/policy-addons` — inline project-scoped AI instructions
 * (correction-plan §2.6; meeting 2026-06-08 @ 00:19:40).
 *
 * Writes are gated on `canEvaluateRules` rather than `canEditPolicy`:
 * the meeting explicitly wants the CONSULTANT authoring these notes, and
 * the consultant's capability row carries canEvaluateRules=true /
 * canEditPolicy=false. The instructions are advisory prompt context — not
 * the governance policy itself — so the lighter gate is correct.
 * Contractor (canEvaluateRules=false) stays read-only.
 */
@Controller('policy-addons')
export class PolicyAddonsController {
  constructor(private readonly addons: PolicyAddonsService) {}

  @Get()
  @RequiresCapability('canRead')
  list(
    @Query('projectKey') projectKey?: string,
    @Query('surface') surface?: string,
  ): Promise<ProjectPolicyAddon[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.addons.listActive(projectKey, surface);
  }

  @Post()
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  create(@Body() body: CreateAddonBody): Promise<ProjectPolicyAddon> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    return this.addons.create({
      projectBusinessKey: body.projectKey,
      surface: body.surface ?? '*',
      content: body.content ?? '',
      authoredBy: body.authoredBy ?? null,
      authoredByRole: body.authoredByRole ?? null,
    });
  }

  @Delete(':id')
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  deactivate(
    @Param('id') id: string,
    @Query('by') by?: string,
  ): Promise<ProjectPolicyAddon> {
    return this.addons.deactivate(id, by ?? null);
  }
}
