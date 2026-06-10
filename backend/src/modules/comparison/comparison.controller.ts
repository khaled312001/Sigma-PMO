import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { OutputComparison } from '../canonical/entities/output-comparison.entity';
import { ComparisonService } from './comparison.service';

interface CreateBody {
  projectKey: string;
  taskKind: string;
  title: string;
  aiOutputId: string;
  aiSummary: string;
  humanOutputId?: string | null;
  humanSummary: string;
}

interface VerdictBody {
  verdict: string;
  decidedBy: string;
  reconciliation?: string | null;
}

/**
 * `/comparison` — AI-vs-Human output comparison surface
 * (correction-plan §2.10, transcript 00:46:14).
 *
 * Reads are open to every authenticated role. Registering a pair requires
 * `canEvaluateRules` (reviewer level and up); recording the VERDICT requires
 * `canEditPolicy` — the verdict is a governance judgement that feeds persona
 * refinement, so it belongs to the project-director tier (admin / client).
 */
@Controller('comparison')
export class ComparisonController {
  constructor(private readonly comparison: ComparisonService) {}

  @Get()
  @RequiresCapability('canRead')
  list(@Query('projectKey') projectKey?: string): Promise<OutputComparison[]> {
    if (!projectKey) {
      throw new BadRequestException('projectKey query parameter is required');
    }
    return this.comparison.list(projectKey);
  }

  @Get(':id')
  @RequiresCapability('canRead')
  get(@Param('id') id: string): Promise<OutputComparison> {
    return this.comparison.getById(id);
  }

  @Post()
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  create(@Body() body: CreateBody): Promise<OutputComparison> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    return this.comparison.create({
      projectBusinessKey: body.projectKey,
      taskKind: body.taskKind ?? '',
      title: body.title ?? '',
      aiOutputId: body.aiOutputId ?? '',
      aiSummary: body.aiSummary ?? '',
      humanOutputId: body.humanOutputId ?? null,
      humanSummary: body.humanSummary ?? '',
    });
  }

  @Post(':id/verdict')
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  verdict(
    @Param('id') id: string,
    @Body() body: VerdictBody,
  ): Promise<OutputComparison> {
    if (!body?.verdict) throw new BadRequestException('verdict is required');
    if (!body?.decidedBy) throw new BadRequestException('decidedBy is required');
    return this.comparison.recordVerdict(
      id,
      body.verdict,
      body.decidedBy,
      body.reconciliation,
    );
  }
}
