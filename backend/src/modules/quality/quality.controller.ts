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
import { User } from '../canonical/entities';
import { QualityRecord } from '../canonical/entities/quality-record.entity';
import { AiAnalysisService } from '../ai-analysis/ai-analysis.service';
import { QualityGovernanceService } from './quality-governance.service';
import type { NcrClaimChain, QualityFinding } from './quality-governance.service';
import { QualityService } from './quality.service';
import type { CreateQualityRecordInput, UpdateQualityRecordInput } from './quality.service';

/**
 * `/quality` — QA/QC Governance (Mr. Ayham acceptance #4): the construction
 * quality lifecycle — Inspection Requests (WIR), Material Inspection Requests
 * (MIR), Method Statements, ITPs with hold & witness points, NCRs, corrective
 * actions and test reports. Produces a quality compliance score + first-pass
 * acceptance rate, an open-findings register, a quality trend, and NCR claim
 * chains (NCR → Rework → Delay + Cost → Critical Path → EOT/Cost → Claim
 * readiness). Gated on `canRunQuality`.
 */
@Controller('quality')
export class QualityController {
  constructor(
    private readonly quality: QualityService,
    private readonly governance: QualityGovernanceService,
    private readonly aiAnalysis: AiAnalysisService,
  ) {}

  // ── Records ──

  @Get('records')
  @RequiresCapability('canRunQuality')
  listRecords(@Query('projectKey') projectKey?: string): Promise<QualityRecord[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.quality.list(projectKey);
  }

  @Post('records')
  @HttpCode(200)
  @RequiresCapability('canRunQuality')
  createRecord(@Body() body: Omit<CreateQualityRecordInput, 'createdBy'>, @Req() req: { user?: User }): Promise<QualityRecord> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    return this.quality.createRecord({ ...body, createdBy: req.user?.displayName ?? null });
  }

  @Patch('records/:id')
  @HttpCode(200)
  @RequiresCapability('canRunQuality')
  updateRecord(@Param('id') id: string, @Body() body: UpdateQualityRecordInput): Promise<QualityRecord> {
    return this.quality.updateRecord(id, body);
  }

  // ── Quality score (compliance + first-pass rate) ──

  @Get('score')
  @RequiresCapability('canRunQuality')
  score(@Query('projectKey') projectKey?: string, @Query('asOf') asOf?: string): Promise<unknown> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.governance.qualityHealth(projectKey, asOf || undefined);
  }

  // ── Governance findings (computed register, not persisted) ──

  @Get('findings')
  @RequiresCapability('canRunQuality')
  async findings(@Query('projectKey') projectKey?: string, @Query('asOf') asOf?: string): Promise<{ findings: QualityFinding[]; claimChains: NcrClaimChain[] }> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    const result = await this.governance.validate(projectKey, asOf || undefined);
    return { findings: result.findings, claimChains: result.claimChains };
  }

  @Post('governance/run')
  @HttpCode(200)
  @RequiresCapability('canRunQuality')
  async run(@Body() body: { projectKey: string; asOf?: string }): Promise<{ score: unknown; findings: QualityFinding[]; claimChains: NcrClaimChain[] }> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const [score, validation] = await Promise.all([
      this.governance.qualityHealth(body.projectKey, body.asOf || undefined),
      this.governance.validate(body.projectKey, body.asOf || undefined),
    ]);
    return { score, findings: validation.findings, claimChains: validation.claimChains };
  }

  // ── AI narration (domain 'governance' — PMBOK/FIDIC/ISO reference library) ──

  @Post('ai-analysis')
  @HttpCode(200)
  @RequiresCapability('canRunQuality')
  async aiAnalysisRun(@Body() body: { projectKey: string; asOf?: string; language?: 'en' | 'ar' }): Promise<unknown> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const [health, validation] = await Promise.all([
      this.governance.qualityHealth(body.projectKey, body.asOf || undefined),
      this.governance.validate(body.projectKey, body.asOf || undefined),
    ]);
    return this.aiAnalysis.analyse({
      domain: 'governance',
      title: `QA/QC governance — ${body.projectKey}`,
      language: body.language,
      context: {
        qualityHealth: {
          complianceScore: health.complianceScore,
          firstPassRate: health.firstPassRate,
          status: health.status,
          trend: health.trend,
        },
        counts: health.counts,
        openBySeverity: health.openBySeverity,
        records: health.records,
        findings: validation.findings.map((f) => ({ type: f.type, severity: f.severity, title: f.title })),
        ncrClaimChains: validation.claimChains.map((c) => ({
          recordKey: c.recordKey,
          eotDays: c.eotDays,
          costImpact: c.costImpact,
          criticalPathImpact: c.criticalPathImpact,
          claimReady: c.claimReady,
        })),
      },
    });
  }
}
