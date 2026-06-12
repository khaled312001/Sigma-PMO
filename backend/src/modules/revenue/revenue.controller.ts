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
import {
  AgentExecution,
  LifecycleLedgerEntry,
  QsFinding,
  User,
} from '../canonical/entities';
import { TraceabilityService } from '../quantity-survey/traceability.service';
import type { RecordInput } from '../quantity-survey/traceability.service';
import { REVENUE_STAGES, CASHFLOW_STAGES, STAGE_LABELS, STAGE_LABELS_AR } from '../quantity-survey/traceability-chains';
import type { LedgerDimension } from '../quantity-survey/traceability-chains';
import { AiAnalysisService } from '../ai-analysis/ai-analysis.service';
import { RevenueAgentService } from './revenue-agent.service';
import { RevenueGovernanceService } from './revenue-governance.service';

/**
 * `/revenue` — Revenue Governance (Mr. Ayham, 2026-06-12 follow-up): the
 * revenue + cash-flow lifecycle ledger, chain validation, and the
 * revenue→NPV/IRR impact analysis (via the `ext.revenue_governance` agent).
 * Gated on `canRunRevenueGovernance`. Records go through the shared traceability
 * ledger but only for the revenue/cashflow dimensions.
 */
@Controller('revenue')
export class RevenueController {
  constructor(
    private readonly traceability: TraceabilityService,
    private readonly revenue: RevenueGovernanceService,
    private readonly aiAnalysis: AiAnalysisService,
    private readonly agent: RevenueAgentService,
  ) {}

  /** AI analysis of the revenue position + NPV/IRR impact, grounded in real
   *  investment references (Damodaran, Brealey-Myers, RICS DCF, World Bank PPP).
   *  Advisory; graceful fallback when no Claude key is configured. */
  @Post('ai-analysis')
  @HttpCode(200)
  @RequiresCapability('canRunRevenueGovernance')
  async aiAnalysisRun(@Body() body: { projectKey: string; opportunityId?: string; language?: 'en' | 'ar' }): Promise<unknown> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const impact = await this.revenue.impact(body.projectKey, body.opportunityId);
    return this.aiAnalysis.analyse({
      domain: 'revenue',
      title: `Revenue governance — ${body.projectKey}`,
      language: body.language,
      context: {
        revenue: impact.revenue,
        base: impact.base,
        adjusted: impact.adjusted,
        impact: impact.impact,
        recommendation: impact.recommendation,
      },
    });
  }

  @Get('chains')
  @RequiresCapability('canRunRevenueGovernance')
  chains(): Record<string, unknown> {
    return {
      revenue: { stages: REVENUE_STAGES, labels: STAGE_LABELS, labelsAr: STAGE_LABELS_AR },
      cashflow: { stages: CASHFLOW_STAGES, labels: STAGE_LABELS, labelsAr: STAGE_LABELS_AR },
    };
  }

  @Post('record')
  @HttpCode(200)
  @RequiresCapability('canRunRevenueGovernance')
  record(@Body() body: Omit<RecordInput, 'recordedBy'>, @Req() req: { user?: User }): Promise<LifecycleLedgerEntry> {
    if (body?.dimension !== 'revenue' && body?.dimension !== 'cashflow') {
      throw new BadRequestException('dimension must be "revenue" or "cashflow" on the revenue surface');
    }
    return this.traceability.record({ ...body, recordedBy: req.user?.displayName ?? null });
  }

  @Get('subjects')
  @RequiresCapability('canRunRevenueGovernance')
  subjects(@Query('projectKey') projectKey?: string): Promise<unknown> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.traceability.subjects(projectKey).then((rows) =>
      (rows as Array<{ dimension: string }>).filter((r) => r.dimension === 'revenue' || r.dimension === 'cashflow'));
  }

  @Get('chain')
  @RequiresCapability('canRunRevenueGovernance')
  chain(
    @Query('projectKey') projectKey?: string,
    @Query('dimension') dimension?: LedgerDimension,
    @Query('subjectKey') subjectKey?: string,
  ): Promise<unknown> {
    if (!projectKey || !dimension || !subjectKey) {
      throw new BadRequestException('projectKey, dimension and subjectKey are all required');
    }
    return this.traceability.chain(projectKey, dimension, subjectKey);
  }

  @Post('validate')
  @HttpCode(200)
  @RequiresCapability('canRunRevenueGovernance')
  validate(@Body() body: { projectKey: string }): Promise<unknown> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    return this.revenue.validate(body.projectKey);
  }

  @Get('impact')
  @RequiresCapability('canRunRevenueGovernance')
  impact(
    @Query('projectKey') projectKey?: string,
    @Query('opportunityId') opportunityId?: string,
    @Query('subjectKey') subjectKey?: string,
  ): Promise<unknown> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.revenue.impact(projectKey, opportunityId, subjectKey ?? 'project');
  }

  @Get('findings')
  @RequiresCapability('canRunRevenueGovernance')
  async findings(@Query('projectKey') projectKey?: string): Promise<QsFinding[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    // chain-variance findings carry the dimension in refs; surface revenue/cashflow only.
    const all = await this.traceability.listChainFindings(projectKey);
    return all.filter((f) => {
      const dim = (f.refs as { dimension?: string })?.dimension;
      return dim === 'revenue' || dim === 'cashflow';
    });
  }

  @Post('governance/run')
  @HttpCode(200)
  @RequiresCapability('canRunRevenueGovernance')
  async run(@Body() body: { projectKey: string; opportunityId?: string }, @Req() req: { user?: User }): Promise<{ execution: AgentExecution; impact: unknown }> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const execution = await this.agent.run({
      nodeBusinessKey: body.projectKey,
      triggeredBy: req.user?.displayName ?? 'revenue-ui',
      params: { projectKey: body.projectKey, opportunityId: body.opportunityId },
    });
    const impact = await this.revenue.impact(body.projectKey, body.opportunityId);
    return { execution, impact };
  }
}
