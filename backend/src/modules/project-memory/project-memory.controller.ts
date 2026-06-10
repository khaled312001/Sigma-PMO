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
import { ProjectMemory } from '../canonical/entities';
import { ProjectMemoryService } from './project-memory.service';

/**
 * `/project-memory` — the project "understudy" memory surface
 * (correction-plan §2.11). Reads are open to every authenticated role;
 * recording / deactivating facts and triggering a harvest require
 * `canEvaluateRules` (reviewer/consultant level and up).
 */
@Controller('project-memory')
export class ProjectMemoryController {
  constructor(private readonly memory: ProjectMemoryService) {}

  @Get()
  @RequiresCapability('canRead')
  list(@Query('projectKey') projectKey?: string): Promise<ProjectMemory[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.memory.list(projectKey);
  }

  @Post()
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  record(
    @Body()
    body: { projectKey: string; factType?: string; content: string; recordedBy?: string | null },
  ): Promise<ProjectMemory> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    return this.memory.record({
      projectBusinessKey: body.projectKey,
      factType: body.factType ?? 'characteristic',
      content: body.content ?? '',
      recordedBy: body.recordedBy ?? null,
    });
  }

  @Post('harvest')
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  harvest(@Body() body: { projectKey: string }): Promise<ProjectMemory[]> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    return this.memory.harvest(body.projectKey);
  }

  @Delete(':id')
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  deactivate(@Param('id') id: string): Promise<ProjectMemory> {
    return this.memory.deactivate(id);
  }
}
