import {
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
import { LessonsLearned } from '../canonical/entities';
import { KnowledgeService } from './knowledge.service';

/**
 * `/knowledge` — the L0 Knowledge & Rules Engine surface. Reads are open to any
 * authenticated role (every layer references L0). Recording / deactivating
 * lessons requires `canEditPolicy` (governance authoring tier).
 */
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get('rules')
  @RequiresCapability('canRead')
  rules() {
    return this.knowledge.rules();
  }

  @Get('sources')
  @RequiresCapability('canRead')
  sources() {
    return this.knowledge.listSources();
  }

  @Get('frameworks')
  @RequiresCapability('canRead')
  frameworks(@Query('projectKey') projectKey?: string) {
    return this.knowledge.listFrameworks(projectKey);
  }

  @Get('lessons')
  @RequiresCapability('canRead')
  lessons(@Query('projectKey') projectKey?: string): Promise<LessonsLearned[]> {
    return this.knowledge.listLessons(projectKey);
  }

  @Get('pack')
  @RequiresCapability('canRead')
  pack(@Query('layer') layer: string, @Query('projectKey') projectKey?: string) {
    return this.knowledge.getKnowledgePack(layer || 'l0_knowledge', projectKey);
  }

  @Post('lessons')
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  recordLesson(
    @Body()
    body: {
      title: string; content: string; category: string;
      standardRef?: string | null; projectBusinessKey?: string | null;
      appliesToLayers?: string[]; recordedBy?: string | null;
    },
  ): Promise<LessonsLearned> {
    return this.knowledge.recordLesson(body);
  }

  @Delete('lessons/:id')
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  deactivateLesson(@Param('id') id: string): Promise<LessonsLearned> {
    return this.knowledge.deactivateLesson(id);
  }
}
