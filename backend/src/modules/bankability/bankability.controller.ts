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
import { BankabilityAgentService } from './bankability-agent.service';
import { BankabilityService } from './bankability.service';
import type { BankabilityFinding } from './bankability.service';

/**
 * `/bankability` — Bankability Intelligence (Mr. Ayham, 2026-06-13 full
 * governance lifecycle): transforms feasibility outputs into a lender-ready
 * package — DSCR vs covenant, an annuity-based debt schedule, funding
 * requirements (CAPEX vs committed facilities), a bankability verdict and
 * investor + lender package readiness (run through the `ext.bankability`
 * agent). Read-only over feasibility + funding canonical data. Gated on
 * `canRunBankability`.
 */
@Controller('bankability')
export class BankabilityController {
  constructor(
    private readonly bankability: BankabilityService,
    private readonly aiAnalysis: AiAnalysisService,
    private readonly agent: BankabilityAgentService,
  ) {}

  // ── Bankability assessment (computed, not persisted) ──

  @Get('assessment')
  @RequiresCapability('canRunBankability')
  assessment(@Query('projectKey') projectKey?: string, @Query('asOf') asOf?: string): Promise<unknown> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.bankability.assess(projectKey, asOf || undefined);
  }

  // ── Governance findings (computed, not persisted) ──

  @Get('findings')
  @RequiresCapability('canRunBankability')
  async findings(@Query('projectKey') projectKey?: string, @Query('asOf') asOf?: string): Promise<BankabilityFinding[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    const result = await this.bankability.validate(projectKey, asOf || undefined);
    return result.findings;
  }

  @Post('governance/run')
  @HttpCode(200)
  @RequiresCapability('canRunBankability')
  async run(
    @Body() body: { projectKey: string; asOf?: string },
    @Req() req: { user?: User },
  ): Promise<{ execution: AgentExecution; assessment: unknown; findings: BankabilityFinding[] }> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const execution = await this.agent.run({
      nodeBusinessKey: body.projectKey,
      triggeredBy: req.user?.displayName ?? 'bankability-ui',
      params: { projectKey: body.projectKey, asOfDate: body.asOf },
    });
    const [assessment, validation] = await Promise.all([
      this.bankability.assess(body.projectKey, body.asOf || undefined),
      this.bankability.validate(body.projectKey, body.asOf || undefined),
    ]);
    return { execution, assessment, findings: validation.findings };
  }

  // ── AI narration (domain 'feasibility' — investment-finance reference library) ──

  /** AI analysis of the bankability position + assessment + findings, grounded
   *  in real investment-finance references. Advisory; graceful fallback when no
   *  Claude key is configured. */
  @Post('ai-analysis')
  @HttpCode(200)
  @RequiresCapability('canRunBankability')
  async aiAnalysisRun(@Body() body: { projectKey: string; asOf?: string; language?: 'en' | 'ar' }): Promise<unknown> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const [assessment, validation] = await Promise.all([
      this.bankability.assess(body.projectKey, body.asOf || undefined),
      this.bankability.validate(body.projectKey, body.asOf || undefined),
    ]);
    return this.aiAnalysis.analyse({
      domain: 'feasibility',
      title: `Bankability assessment — ${body.projectKey}`,
      language: body.language,
      context: {
        bankability: { score: assessment.score, verdict: assessment.verdict, status: assessment.status, components: assessment.components },
        dscr: assessment.dscr,
        fundingRequirements: assessment.fundingRequirements,
        investorPackage: { ready: assessment.investorPackage.ready, itemsReady: assessment.investorPackage.itemsReady, itemsTotal: assessment.investorPackage.itemsTotal },
        lenderPackage: { ready: assessment.lenderPackage.ready, itemsReady: assessment.lenderPackage.itemsReady, itemsTotal: assessment.lenderPackage.itemsTotal },
        facilities: assessment.facilities,
        findings: validation.findings.map((f) => ({ type: f.type, severity: f.severity, title: f.title })),
      },
    });
  }
}
