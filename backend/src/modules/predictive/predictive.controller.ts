import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { AgentExecution, User } from '../canonical/entities';
import { AiAnalysisService } from '../ai-analysis/ai-analysis.service';
import { PREDICTIVE_AS_OF, PredictionResult, PredictionService } from './prediction.service';
import { PredictiveAgentService } from './predictive-agent.service';

/**
 * `/predictive` — Predictive Governance (Mr. Ayham, 2026-06-12 active scope):
 * stateless, deterministic forecasts of cost/schedule/revenue/procurement/
 * funding risk for a project, plus the consolidated predictive governance
 * status (via the `ext.predictive` agent) and a grounded AI narrative. Gated on
 * `canRunPredictive`.
 */
@Controller('predictive')
export class PredictiveController {
  constructor(
    private readonly prediction: PredictionService,
    private readonly aiAnalysis: AiAnalysisService,
    private readonly agent: PredictiveAgentService,
  ) {}

  /** The five forecasts + worst-of predictive governance status for a project. */
  @Get('forecast')
  @RequiresCapability('canRunPredictive')
  forecast(
    @Query('projectKey') projectKey?: string,
    @Query('asOfDate') asOfDate?: string,
  ): Promise<PredictionResult> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.prediction.forecast(projectKey, asOfDate || PREDICTIVE_AS_OF);
  }

  /** Run the `ext.predictive` agent (audited execution) and return forecasts. */
  @Post('run')
  @HttpCode(200)
  @RequiresCapability('canRunPredictive')
  async run(
    @Body() body: { projectKey: string; asOfDate?: string },
    @Req() req: { user?: User },
  ): Promise<{ execution: AgentExecution; forecast: PredictionResult }> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const asOfDate = body.asOfDate || PREDICTIVE_AS_OF;
    const execution = await this.agent.run({
      nodeBusinessKey: body.projectKey,
      triggeredBy: req.user?.displayName ?? 'predictive-ui',
      params: { projectKey: body.projectKey, asOfDate },
    });
    const forecast = await this.prediction.forecast(body.projectKey, asOfDate);
    return { execution, forecast };
  }

  /** AI narrative of the predictive position, grounded in real governance/EVM
   *  references. Advisory; graceful fallback when no Claude key is configured. */
  @Post('ai-analysis')
  @HttpCode(200)
  @RequiresCapability('canRunPredictive')
  async aiAnalysisRun(
    @Body() body: { projectKey: string; asOfDate?: string; language?: 'en' | 'ar' },
  ): Promise<unknown> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const result = await this.prediction.forecast(body.projectKey, body.asOfDate || PREDICTIVE_AS_OF);
    return this.aiAnalysis.analyse({
      domain: 'governance',
      title: `Predictive governance — ${body.projectKey}`,
      language: body.language,
      context: {
        asOfDate: result.asOfDate,
        predictiveGovernanceStatus: result.predictiveGovernanceStatus,
        forecasts: result.forecasts.map((f) => ({
          metric: f.metric,
          value: f.value,
          unit: f.unit,
          severity: f.severity,
          basis: f.basis,
          recommendedAction: f.recommendedAction,
        })),
      },
    });
  }
}
