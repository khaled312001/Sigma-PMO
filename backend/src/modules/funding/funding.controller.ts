import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { AgentExecution, FundingFacility, User } from '../canonical/entities';
import { AiAnalysisService } from '../ai-analysis/ai-analysis.service';
import { FundingAgentService } from './funding-agent.service';
import { FundingGovernanceService } from './funding-governance.service';
import type { FundingFinding } from './funding-governance.service';
import { FundingService } from './funding.service';
import type { CreateFacilityInput, UpdateFacilityInput } from './funding.service';

/**
 * `/funding` — Funding Governance (Mr. Ayham, 2026-06-12 active scope): loan +
 * equity facilities with drawdown, DSCR + covenant monitoring, debt-service
 * tracking, refinancing-risk signals and a funding-health composite (run
 * through the `ext.funding` agent). Connects Revenue Governance to Investment
 * Governance. Gated on `canRunFunding`.
 */
@Controller('funding')
export class FundingController {
  constructor(
    private readonly funding: FundingService,
    private readonly governance: FundingGovernanceService,
    private readonly aiAnalysis: AiAnalysisService,
    private readonly agent: FundingAgentService,
  ) {}

  // ── Facilities ──

  @Get('facilities')
  @RequiresCapability('canRunFunding')
  listFacilities(@Query('projectKey') projectKey?: string): Promise<FundingFacility[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.funding.list(projectKey);
  }

  @Post('facilities')
  @HttpCode(200)
  @RequiresCapability('canRunFunding')
  createFacility(@Body() body: Omit<CreateFacilityInput, 'createdBy'>, @Req() req: { user?: User }): Promise<FundingFacility> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    return this.funding.createFacility({ ...body, createdBy: req.user?.displayName ?? null });
  }

  @Patch('facilities/:id')
  @HttpCode(200)
  @RequiresCapability('canRunFunding')
  updateFacility(@Param('id') id: string, @Body() body: UpdateFacilityInput): Promise<FundingFacility> {
    return this.funding.updateFacility(id, body);
  }

  // ── Funding health ──

  @Get('health')
  @RequiresCapability('canRunFunding')
  health(@Query('projectKey') projectKey?: string, @Query('asOf') asOf?: string): Promise<unknown> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.governance.fundingHealth(projectKey, asOf || undefined);
  }

  // ── Governance findings (computed, not persisted) ──

  @Get('findings')
  @RequiresCapability('canRunFunding')
  async findings(@Query('projectKey') projectKey?: string, @Query('asOf') asOf?: string): Promise<FundingFinding[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    const result = await this.governance.validate(projectKey, asOf || undefined);
    return result.findings;
  }

  @Post('governance/run')
  @HttpCode(200)
  @RequiresCapability('canRunFunding')
  async run(
    @Body() body: { projectKey: string; asOf?: string },
    @Req() req: { user?: User },
  ): Promise<{ execution: AgentExecution; health: unknown; findings: FundingFinding[] }> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const execution = await this.agent.run({
      nodeBusinessKey: body.projectKey,
      triggeredBy: req.user?.displayName ?? 'funding-ui',
      params: { projectKey: body.projectKey, asOfDate: body.asOf },
    });
    const [health, validation] = await Promise.all([
      this.governance.fundingHealth(body.projectKey, body.asOf || undefined),
      this.governance.validate(body.projectKey, body.asOf || undefined),
    ]);
    return { execution, health, findings: validation.findings };
  }

  // ── AI narration (domain 'revenue' — investment-finance reference library) ──

  /** AI analysis of the funding position + health + findings, grounded in real
   *  investment-finance references. Advisory; graceful fallback when no Claude
   *  key is configured. */
  @Post('ai-analysis')
  @HttpCode(200)
  @RequiresCapability('canRunFunding')
  async aiAnalysisRun(@Body() body: { projectKey: string; asOf?: string; language?: 'en' | 'ar' }): Promise<unknown> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const [health, validation] = await Promise.all([
      this.governance.fundingHealth(body.projectKey, body.asOf || undefined),
      this.governance.validate(body.projectKey, body.asOf || undefined),
    ]);
    return this.aiAnalysis.analyse({
      domain: 'revenue',
      title: `Funding governance — ${body.projectKey}`,
      language: body.language,
      context: {
        fundingHealth: { score: health.score, status: health.status, components: health.components },
        totals: health.totals,
        facilities: health.facilities,
        findings: validation.findings.map((f) => ({ type: f.type, severity: f.severity, title: f.title })),
      },
    });
  }
}
