import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { ExecutiveSummary } from '../canonical/entities';
import { GenerateSummaryDto } from './dto/generate-summary.dto';
import { LlmService } from './llm.service';
import { SummaryService } from './summary.service';

@Controller('summary')
export class SummaryController {
  constructor(private readonly summaries: SummaryService, private readonly llm: LlmService) {}

  @Get('llm-status')
  @RequiresCapability('canRead')
  llmStatus() {
    return { enabled: this.llm.isEnabled(), ...(this.llm.describe() ?? {}) };
  }

  @Post('generate')
  @HttpCode(200)
  @RequiresCapability('canGenerateSummary')
  generate(@Body() body: GenerateSummaryDto): Promise<ExecutiveSummary> {
    return this.summaries.generate(body);
  }

  @Get()
  @RequiresCapability('canRead')
  list(
    @Query('projectId') projectId?: string,
    @Query('limit') limit?: string,
    @Query('projectKey') projectKey?: string,
  ): Promise<ExecutiveSummary[]> {
    const lim = limit ? Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 20)) : 20;
    return this.summaries.list(projectId, lim, projectKey);
  }
}
