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
import { AgentExecution } from '../canonical/entities/agent-execution.entity';
import { User } from '../canonical/entities/user.entity';
import { AuthoritySubmission } from '../canonical/entities/authority-submission.entity';
import { AiAnalysisService } from '../ai-analysis/ai-analysis.service';
import { AuthorityAgentService } from './authority-agent.service';
import { AuthorityGovernanceService } from './authority-governance.service';
import type { AuthorityFinding } from './authority-governance.service';
import { AuthorityService } from './authority.service';
import type { CreateAuthoritySubmissionInput, UpdateAuthoritySubmissionInput } from './authority.service';

/**
 * `/authority` — Authority Governance (Mr. Ayham, 2026-06-13 — full 17-stage
 * governance lifecycle): all authority submissions & approvals (municipality,
 * civil defence, utilities, environmental, RTA, health) with readiness scoring,
 * outstanding-comment tracking, forecast-approval dates and — the core —
 * auto-calculated project delay exposure + critical-path impact when an approval
 * forecast slips past its required-by date (authority delay → not the
 * contractor's fault, feeding claims). Run through the `ext.authority` agent.
 * Gated on `canRunAuthority`.
 */
@Controller('authority')
export class AuthorityController {
  constructor(
    private readonly authority: AuthorityService,
    private readonly governance: AuthorityGovernanceService,
    private readonly aiAnalysis: AiAnalysisService,
    private readonly agent: AuthorityAgentService,
  ) {}

  // ── Submissions ──

  @Get('submissions')
  @RequiresCapability('canRunAuthority')
  listSubmissions(@Query('projectKey') projectKey?: string): Promise<AuthoritySubmission[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.authority.list(projectKey);
  }

  @Post('submissions')
  @HttpCode(200)
  @RequiresCapability('canRunAuthority')
  createSubmission(@Body() body: Omit<CreateAuthoritySubmissionInput, 'createdBy'>, @Req() req: { user?: User }): Promise<AuthoritySubmission> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    return this.authority.createSubmission({ ...body, createdBy: req.user?.displayName ?? null });
  }

  @Patch('submissions/:id')
  @HttpCode(200)
  @RequiresCapability('canRunAuthority')
  updateSubmission(@Param('id') id: string, @Body() body: UpdateAuthoritySubmissionInput): Promise<AuthoritySubmission> {
    return this.authority.updateSubmission(id, body);
  }

  // ── Authority readiness score (+ dashboard / forecast / delay exposure) ──

  @Get('score')
  @RequiresCapability('canRunAuthority')
  score(@Query('projectKey') projectKey?: string, @Query('asOf') asOf?: string): Promise<unknown> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.governance.score(projectKey, asOf || undefined);
  }

  // ── Governance findings (computed, not persisted) ──

  @Get('findings')
  @RequiresCapability('canRunAuthority')
  async findings(@Query('projectKey') projectKey?: string, @Query('asOf') asOf?: string): Promise<AuthorityFinding[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    const result = await this.governance.validate(projectKey, asOf || undefined);
    return result.findings;
  }

  @Post('governance/run')
  @HttpCode(200)
  @RequiresCapability('canRunAuthority')
  async run(
    @Body() body: { projectKey: string; asOf?: string },
    @Req() req: { user?: User },
  ): Promise<{ execution: AgentExecution; score: unknown; findings: AuthorityFinding[] }> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const execution = await this.agent.run({
      nodeBusinessKey: body.projectKey,
      triggeredBy: req.user?.displayName ?? 'authority-ui',
      params: { projectKey: body.projectKey, asOfDate: body.asOf },
    });
    const [score, validation] = await Promise.all([
      this.governance.score(body.projectKey, body.asOf || undefined),
      this.governance.validate(body.projectKey, body.asOf || undefined),
    ]);
    return { execution, score, findings: validation.findings };
  }

  // ── AI narration (domain 'governance' — PMI/FIDIC/ISO reference library) ──

  /** AI analysis of the authority position + readiness + delay exposure,
   *  grounded in real governance references. Advisory; graceful fallback when no
   *  Claude key is configured. */
  @Post('ai-analysis')
  @HttpCode(200)
  @RequiresCapability('canRunAuthority')
  async aiAnalysisRun(@Body() body: { projectKey: string; asOf?: string; language?: 'en' | 'ar' }): Promise<unknown> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const [score, validation] = await Promise.all([
      this.governance.score(body.projectKey, body.asOf || undefined),
      this.governance.validate(body.projectKey, body.asOf || undefined),
    ]);
    return this.aiAnalysis.analyse({
      domain: 'governance',
      title: `Authority governance — ${body.projectKey}`,
      language: body.language,
      context: {
        authorityReadiness: { score: score.score, status: score.status },
        statusCounts: score.statusCounts,
        totals: score.totals,
        submissions: score.submissions,
        delayExposure: score.delayExposure.map((d) => ({ businessKey: d.businessKey, authority: d.authority, status: d.status, delayExposureDays: d.delayExposureDays, criticalPathImpact: d.criticalPathImpact })),
        findings: validation.findings.map((f) => ({ type: f.type, severity: f.severity, title: f.title })),
      },
    });
  }
}
