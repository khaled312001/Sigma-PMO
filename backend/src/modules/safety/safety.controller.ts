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
import { AgentExecution, User } from '../canonical/entities';
import { SafetyRecord } from '../canonical/entities/safety-record.entity';
import { AiAnalysisService } from '../ai-analysis/ai-analysis.service';
import { SafetyAgentService } from './safety-agent.service';
import { SafetyGovernanceService } from './safety-governance.service';
import type { SafetyFinding, StopWorkClaimChain } from './safety-governance.service';
import { SafetyService } from './safety.service';
import type { CreateSafetyRecordInput, UpdateSafetyRecordInput } from './safety.service';

/**
 * `/safety` — Safety Governance (Mr. Ayham, 2026-06-13 full governance
 * lifecycle): governs implementation of approved HSE plans during execution —
 * HSE plans, reports, inspections, permits, incidents, near-misses, corrective
 * actions, toolbox talks and audits. Produces a safety compliance score + HSE
 * performance index, an open-findings risk register, a safety trend, and
 * stop-work claim chains (Safety Event → Stop Work → Delay → Critical Path →
 * EOT → Claim readiness), run through the `ext.safety` agent. Gated on
 * `canRunSafety`.
 */
@Controller('safety')
export class SafetyController {
  constructor(
    private readonly safety: SafetyService,
    private readonly governance: SafetyGovernanceService,
    private readonly aiAnalysis: AiAnalysisService,
    private readonly agent: SafetyAgentService,
  ) {}

  // ── Records ──

  @Get('records')
  @RequiresCapability('canRunSafety')
  listRecords(@Query('projectKey') projectKey?: string): Promise<SafetyRecord[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.safety.list(projectKey);
  }

  @Post('records')
  @HttpCode(200)
  @RequiresCapability('canRunSafety')
  createRecord(@Body() body: Omit<CreateSafetyRecordInput, 'createdBy'>, @Req() req: { user?: User }): Promise<SafetyRecord> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    return this.safety.createRecord({ ...body, createdBy: req.user?.displayName ?? null });
  }

  @Patch('records/:id')
  @HttpCode(200)
  @RequiresCapability('canRunSafety')
  updateRecord(@Param('id') id: string, @Body() body: UpdateSafetyRecordInput): Promise<SafetyRecord> {
    return this.safety.updateRecord(id, body);
  }

  // ── Safety score (compliance + HSE performance index) ──

  @Get('score')
  @RequiresCapability('canRunSafety')
  score(@Query('projectKey') projectKey?: string, @Query('asOf') asOf?: string): Promise<unknown> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.governance.safetyHealth(projectKey, asOf || undefined);
  }

  // ── Governance findings (computed risk register, not persisted) ──

  @Get('findings')
  @RequiresCapability('canRunSafety')
  async findings(@Query('projectKey') projectKey?: string, @Query('asOf') asOf?: string): Promise<{ findings: SafetyFinding[]; claimChains: StopWorkClaimChain[] }> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    const result = await this.governance.validate(projectKey, asOf || undefined);
    return { findings: result.findings, claimChains: result.claimChains };
  }

  @Post('governance/run')
  @HttpCode(200)
  @RequiresCapability('canRunSafety')
  async run(
    @Body() body: { projectKey: string; asOf?: string },
    @Req() req: { user?: User },
  ): Promise<{ execution: AgentExecution; score: unknown; findings: SafetyFinding[]; claimChains: StopWorkClaimChain[] }> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const execution = await this.agent.run({
      nodeBusinessKey: body.projectKey,
      triggeredBy: req.user?.displayName ?? 'safety-ui',
      params: { projectKey: body.projectKey, asOfDate: body.asOf },
    });
    const [score, validation] = await Promise.all([
      this.governance.safetyHealth(body.projectKey, body.asOf || undefined),
      this.governance.validate(body.projectKey, body.asOf || undefined),
    ]);
    return { execution, score, findings: validation.findings, claimChains: validation.claimChains };
  }

  // ── AI narration (domain 'governance' — PMBOK/FIDIC/ISO reference library) ──

  /** AI analysis of the safety position + scores + findings + claim chains,
   *  grounded in real governance references. Advisory; graceful fallback when
   *  no Claude key is configured. */
  @Post('ai-analysis')
  @HttpCode(200)
  @RequiresCapability('canRunSafety')
  async aiAnalysisRun(@Body() body: { projectKey: string; asOf?: string; language?: 'en' | 'ar' }): Promise<unknown> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const [health, validation] = await Promise.all([
      this.governance.safetyHealth(body.projectKey, body.asOf || undefined),
      this.governance.validate(body.projectKey, body.asOf || undefined),
    ]);
    return this.aiAnalysis.analyse({
      domain: 'governance',
      title: `Safety governance — ${body.projectKey}`,
      language: body.language,
      context: {
        safetyHealth: {
          complianceScore: health.complianceScore,
          hsePerformanceIndex: health.hsePerformanceIndex,
          status: health.status,
          trend: health.trend,
        },
        counts: health.counts,
        openBySeverity: health.openBySeverity,
        records: health.records,
        findings: validation.findings.map((f) => ({ type: f.type, severity: f.severity, title: f.title })),
        stopWorkClaimChains: validation.claimChains.map((c) => ({
          recordKey: c.recordKey,
          eotDays: c.eotDays,
          criticalPathImpact: c.criticalPathImpact,
          claimReady: c.claimReady,
        })),
      },
    });
  }
}
