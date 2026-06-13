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
import { OperationalReadinessItem } from '../canonical/entities/operational-readiness-item.entity';
import { AiAnalysisService } from '../ai-analysis/ai-analysis.service';
import { OperationalReadinessAgentService } from './operational-readiness-agent.service';
import { OperationalReadinessGovernanceService } from './operational-readiness-governance.service';
import type { ReadinessFinding } from './operational-readiness-governance.service';
import { OperationalReadinessService } from './operational-readiness.service';
import type { CreateReadinessItemInput, UpdateReadinessItemInput } from './operational-readiness.service';

/**
 * `/operational-readiness` — Operational Readiness Governance (Mr. Ayham,
 * 2026-06-13): governs the construction-complete → operational go-live
 * transition (O&M manuals, asset registers, training, testing & commissioning,
 * handover, staffing, spares, warranties) with a readiness score + go-live /
 * handover / commissioning sub-scores, run through the
 * `ext.operational_readiness` agent. Gated on `canRunOperationalReadiness`.
 */
@Controller('operational-readiness')
export class OperationalReadinessController {
  constructor(
    private readonly readiness: OperationalReadinessService,
    private readonly governance: OperationalReadinessGovernanceService,
    private readonly aiAnalysis: AiAnalysisService,
    private readonly agent: OperationalReadinessAgentService,
  ) {}

  // ── Readiness items ──

  @Get('items')
  @RequiresCapability('canRunOperationalReadiness')
  listItems(@Query('projectKey') projectKey?: string): Promise<OperationalReadinessItem[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.readiness.list(projectKey);
  }

  @Post('items')
  @HttpCode(200)
  @RequiresCapability('canRunOperationalReadiness')
  createItem(@Body() body: Omit<CreateReadinessItemInput, 'createdBy'>, @Req() req: { user?: User }): Promise<OperationalReadinessItem> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    return this.readiness.createItem({ ...body, createdBy: req.user?.displayName ?? null });
  }

  @Patch('items/:id')
  @HttpCode(200)
  @RequiresCapability('canRunOperationalReadiness')
  updateItem(@Param('id') id: string, @Body() body: UpdateReadinessItemInput): Promise<OperationalReadinessItem> {
    return this.readiness.updateItem(id, body);
  }

  // ── Readiness score ──

  @Get('score')
  @RequiresCapability('canRunOperationalReadiness')
  score(@Query('projectKey') projectKey?: string, @Query('asOf') asOf?: string): Promise<unknown> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.governance.readinessScore(projectKey, asOf || undefined);
  }

  // ── Governance findings (computed, not persisted) ──

  @Get('findings')
  @RequiresCapability('canRunOperationalReadiness')
  async findings(@Query('projectKey') projectKey?: string, @Query('asOf') asOf?: string): Promise<ReadinessFinding[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    const result = await this.governance.validate(projectKey, asOf || undefined);
    return result.findings;
  }

  @Post('governance/run')
  @HttpCode(200)
  @RequiresCapability('canRunOperationalReadiness')
  async run(
    @Body() body: { projectKey: string; asOf?: string },
    @Req() req: { user?: User },
  ): Promise<{ execution: AgentExecution; score: unknown; findings: ReadinessFinding[] }> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const execution = await this.agent.run({
      nodeBusinessKey: body.projectKey,
      triggeredBy: req.user?.displayName ?? 'operational-readiness-ui',
      params: { projectKey: body.projectKey, asOfDate: body.asOf },
    });
    const [score, validation] = await Promise.all([
      this.governance.readinessScore(body.projectKey, body.asOf || undefined),
      this.governance.validate(body.projectKey, body.asOf || undefined),
    ]);
    return { execution, score, findings: validation.findings };
  }

  // ── AI narration (domain 'governance' — readiness is a governance discipline) ──

  /** AI analysis of the readiness position + score + findings, grounded in real
   *  governance/PM references. Advisory; graceful fallback when no Claude key is
   *  configured. */
  @Post('ai-analysis')
  @HttpCode(200)
  @RequiresCapability('canRunOperationalReadiness')
  async aiAnalysisRun(@Body() body: { projectKey: string; asOf?: string; language?: 'en' | 'ar' }): Promise<unknown> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const [score, validation] = await Promise.all([
      this.governance.readinessScore(body.projectKey, body.asOf || undefined),
      this.governance.validate(body.projectKey, body.asOf || undefined),
    ]);
    return this.aiAnalysis.analyse({
      domain: 'governance',
      title: `Operational readiness governance — ${body.projectKey}`,
      language: body.language,
      context: {
        readinessScore: { score: score.score, status: score.status, subScores: score.subScores },
        totals: score.totals,
        items: score.items,
        findings: validation.findings.map((f) => ({ type: f.type, severity: f.severity, title: f.title })),
      },
    });
  }
}
