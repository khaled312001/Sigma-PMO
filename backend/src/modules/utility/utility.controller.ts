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
import { UtilityConnection } from '../canonical/entities/utility-connection.entity';
import { AiAnalysisService } from '../ai-analysis/ai-analysis.service';
import { UtilityAgentService } from './utility-agent.service';
import { UtilityGovernanceService } from './utility-governance.service';
import type { UtilityFinding } from './utility-governance.service';
import { UtilityService } from './utility.service';
import type { CreateConnectionInput, UpdateConnectionInput } from './utility.service';

/**
 * `/utility` — Utility Governance (Mr. Ayham, 2026-06-13 17-stage lifecycle
 * scope): power/water/telecom/gas/sewerage/district-cooling connections with
 * readiness status, forecast connection dates, required-by breaches and per-
 * connection delay exposure, plus a Utility Readiness Index (run through the
 * `ext.utility` agent). Gated on `canRunUtility`.
 */
@Controller('utility')
export class UtilityController {
  constructor(
    private readonly utility: UtilityService,
    private readonly governance: UtilityGovernanceService,
    private readonly aiAnalysis: AiAnalysisService,
    private readonly agent: UtilityAgentService,
  ) {}

  // ── Connections ──

  @Get('connections')
  @RequiresCapability('canRunUtility')
  listConnections(@Query('projectKey') projectKey?: string): Promise<UtilityConnection[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.utility.list(projectKey);
  }

  @Post('connections')
  @HttpCode(200)
  @RequiresCapability('canRunUtility')
  createConnection(@Body() body: Omit<CreateConnectionInput, 'createdBy'>, @Req() req: { user?: User }): Promise<UtilityConnection> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    return this.utility.createConnection({ ...body, createdBy: req.user?.displayName ?? null });
  }

  @Patch('connections/:id')
  @HttpCode(200)
  @RequiresCapability('canRunUtility')
  updateConnection(@Param('id') id: string, @Body() body: UpdateConnectionInput): Promise<UtilityConnection> {
    return this.utility.updateConnection(id, body);
  }

  // ── Utility readiness score ──

  @Get('score')
  @RequiresCapability('canRunUtility')
  score(@Query('projectKey') projectKey?: string, @Query('asOf') asOf?: string): Promise<unknown> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.governance.utilityScore(projectKey, asOf || undefined);
  }

  // ── Governance findings (computed, not persisted) ──

  @Get('findings')
  @RequiresCapability('canRunUtility')
  async findings(@Query('projectKey') projectKey?: string, @Query('asOf') asOf?: string): Promise<UtilityFinding[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    const result = await this.governance.validate(projectKey, asOf || undefined);
    return result.findings;
  }

  @Post('governance/run')
  @HttpCode(200)
  @RequiresCapability('canRunUtility')
  async run(
    @Body() body: { projectKey: string; asOf?: string },
    @Req() req: { user?: User },
  ): Promise<{ execution: AgentExecution; score: unknown; findings: UtilityFinding[] }> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const execution = await this.agent.run({
      nodeBusinessKey: body.projectKey,
      triggeredBy: req.user?.displayName ?? 'utility-ui',
      params: { projectKey: body.projectKey, asOfDate: body.asOf },
    });
    const [score, validation] = await Promise.all([
      this.governance.utilityScore(body.projectKey, body.asOf || undefined),
      this.governance.validate(body.projectKey, body.asOf || undefined),
    ]);
    return { execution, score, findings: validation.findings };
  }

  // ── AI narration (domain 'governance' — utility readiness is a delivery-governance concern) ──

  /** AI analysis of the utility readiness position + score + findings, grounded
   *  in real delivery-governance references. Advisory; graceful fallback when no
   *  Claude key is configured. */
  @Post('ai-analysis')
  @HttpCode(200)
  @RequiresCapability('canRunUtility')
  async aiAnalysisRun(@Body() body: { projectKey: string; asOf?: string; language?: 'en' | 'ar' }): Promise<unknown> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const [score, validation] = await Promise.all([
      this.governance.utilityScore(body.projectKey, body.asOf || undefined),
      this.governance.validate(body.projectKey, body.asOf || undefined),
    ]);
    return this.aiAnalysis.analyse({
      domain: 'governance',
      title: `Utility governance — ${body.projectKey}`,
      language: body.language,
      context: {
        utilityReadiness: { score: score.score, status: score.status },
        totals: score.totals,
        connections: score.connections,
        forecasts: score.forecasts.map((f) => ({ businessKey: f.businessKey, utilityType: f.utilityType, status: f.status, forecastConnectionDate: f.forecastConnectionDate, requiredByDate: f.requiredByDate, delayExposureDays: f.delayExposureDays })),
        findings: validation.findings.map((f) => ({ type: f.type, severity: f.severity, title: f.title })),
      },
    });
  }
}
