import { Controller, Get, Query } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { ExecutiveAgentService, ExecutivePack } from './executive-agent.service';
import {
  ExecutiveKpis,
  ExecutiveKpiService,
  PortfolioKpis,
  StrategicKpis,
} from './executive-kpi.service';
import { ExecutiveScores, ExecutiveScoresService } from './executive-scores.service';

/**
 * `/executive` — the L7 Executive Intelligence surface (strategic KPIs +
 * governance headline). Read-only; the same pack the L7 agent emits.
 */
@Controller('executive')
export class ExecutiveController {
  constructor(
    private readonly executive: ExecutiveAgentService,
    private readonly kpis: ExecutiveKpiService,
    private readonly scores: ExecutiveScoresService,
  ) {}

  @Get('overview')
  @RequiresCapability('canRead')
  async overview(@Query('projectKey') projectKey?: string): Promise<ExecutivePack> {
    return this.executive.buildPack(await this.kpis.resolveProjectKey(projectKey));
  }

  /** Deterministic executive headline KPIs (health, confidence, forecasts). */
  @Get('kpis')
  @RequiresCapability('canRead')
  async executiveKpis(@Query('projectKey') projectKey?: string): Promise<ExecutiveKpis> {
    return this.kpis.computeKpis(await this.kpis.resolveProjectKey(projectKey));
  }

  /** Portfolio health roll-up (mean + worst) across all current projects. */
  @Get('kpis/portfolio')
  @RequiresCapability('canRead')
  portfolioKpis(): Promise<PortfolioKpis> {
    return this.kpis.computePortfolio();
  }

  /** Strategic alignment + benefits realization + enterprise governance score. */
  @Get('strategic')
  @RequiresCapability('canEvaluateRules')
  async strategic(@Query('projectKey') projectKey?: string): Promise<StrategicKpis> {
    return this.kpis.computeStrategic(await this.kpis.resolveProjectKey(projectKey));
  }

  /**
   * Enterprise governance score-card — six deterministic 0–100 scores across the
   * full investment lifecycle (enterprise governance, investment governance,
   * portfolio, opportunity pipeline, bankability, funding health). Enterprise-
   * wide (no projectKey); gated on `canReadAll`.
   */
  @Get('scores')
  @RequiresCapability('canReadAll')
  scoreCard(): Promise<ExecutiveScores> {
    return this.scores.compute();
  }
}
