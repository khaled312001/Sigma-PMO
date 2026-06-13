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
import { FireSafetyRecord } from '../canonical/entities/fire-safety-record.entity';
import { AiAnalysisService } from '../ai-analysis/ai-analysis.service';
import { FireLifeSafetyAgentService } from './fire-life-safety-agent.service';
import { FireLifeSafetyGovernanceService } from './fire-life-safety-governance.service';
import type { FireSafetyFinding } from './fire-life-safety-governance.service';
import { FireLifeSafetyService } from './fire-life-safety.service';
import type { CreateFireSafetyRecordInput, UpdateFireSafetyRecordInput } from './fire-life-safety.service';

/**
 * `/fire-safety` — Fire & Life Safety Governance (Mr. Ayham, 2026-06-13
 * 17-stage lifecycle scope): fire-strategy compliance + authority approvals
 * (Civil Defence) over fire-safety records — strategy/drawings, civil-defence
 * reviews, testing & commissioning, inspections — with outstanding-comment
 * tracking, approval-forecast risk and a Fire Readiness composite (run through
 * the `ext.fire_life_safety` agent). Gated on `canRunFireLifeSafety`.
 */
@Controller('fire-safety')
export class FireLifeSafetyController {
  constructor(
    private readonly fireSafety: FireLifeSafetyService,
    private readonly governance: FireLifeSafetyGovernanceService,
    private readonly aiAnalysis: AiAnalysisService,
    private readonly agent: FireLifeSafetyAgentService,
  ) {}

  // ── Records ──

  @Get('records')
  @RequiresCapability('canRunFireLifeSafety')
  listRecords(@Query('projectKey') projectKey?: string): Promise<FireSafetyRecord[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.fireSafety.list(projectKey);
  }

  @Post('records')
  @HttpCode(200)
  @RequiresCapability('canRunFireLifeSafety')
  createRecord(@Body() body: Omit<CreateFireSafetyRecordInput, 'createdBy'>, @Req() req: { user?: User }): Promise<FireSafetyRecord> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    return this.fireSafety.createRecord({ ...body, createdBy: req.user?.displayName ?? null });
  }

  @Patch('records/:id')
  @HttpCode(200)
  @RequiresCapability('canRunFireLifeSafety')
  updateRecord(@Param('id') id: string, @Body() body: UpdateFireSafetyRecordInput): Promise<FireSafetyRecord> {
    return this.fireSafety.updateRecord(id, body);
  }

  // ── Fire readiness ──

  @Get('score')
  @RequiresCapability('canRunFireLifeSafety')
  score(@Query('projectKey') projectKey?: string, @Query('asOf') asOf?: string): Promise<unknown> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.governance.fireReadiness(projectKey, asOf || undefined);
  }

  // ── Governance findings (computed, not persisted) ──

  @Get('findings')
  @RequiresCapability('canRunFireLifeSafety')
  async findings(@Query('projectKey') projectKey?: string, @Query('asOf') asOf?: string): Promise<FireSafetyFinding[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    const result = await this.governance.validate(projectKey, asOf || undefined);
    return result.findings;
  }

  @Post('governance/run')
  @HttpCode(200)
  @RequiresCapability('canRunFireLifeSafety')
  async run(
    @Body() body: { projectKey: string; asOf?: string },
    @Req() req: { user?: User },
  ): Promise<{ execution: AgentExecution; score: unknown; findings: FireSafetyFinding[] }> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const execution = await this.agent.run({
      nodeBusinessKey: body.projectKey,
      triggeredBy: req.user?.displayName ?? 'fire-safety-ui',
      params: { projectKey: body.projectKey, asOfDate: body.asOf },
    });
    const [score, validation] = await Promise.all([
      this.governance.fireReadiness(body.projectKey, body.asOf || undefined),
      this.governance.validate(body.projectKey, body.asOf || undefined),
    ]);
    return { execution, score, findings: validation.findings };
  }

  // ── AI narration (domain 'governance' — compliance/authority-approval reference library) ──

  /** AI analysis of the fire-safety position + readiness + findings, grounded in
   *  real governance/compliance references. Advisory; graceful fallback when no
   *  Claude key is configured. */
  @Post('ai-analysis')
  @HttpCode(200)
  @RequiresCapability('canRunFireLifeSafety')
  async aiAnalysisRun(@Body() body: { projectKey: string; asOf?: string; language?: 'en' | 'ar' }): Promise<unknown> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const [readiness, validation] = await Promise.all([
      this.governance.fireReadiness(body.projectKey, body.asOf || undefined),
      this.governance.validate(body.projectKey, body.asOf || undefined),
    ]);
    return this.aiAnalysis.analyse({
      domain: 'governance',
      title: `Fire & life safety governance — ${body.projectKey}`,
      language: body.language,
      context: {
        fireReadiness: { score: readiness.score, status: readiness.status, components: readiness.components },
        totals: readiness.totals,
        records: readiness.records,
        approvalForecast: readiness.approvalForecast,
        findings: validation.findings.map((f) => ({ type: f.type, severity: f.severity, title: f.title })),
      },
    });
  }
}
