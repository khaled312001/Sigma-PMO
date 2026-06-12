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
import {
  AgentExecution,
  ProcurementFinding,
  ProcurementPackage,
  User,
  Vendor,
} from '../canonical/entities';
import { AiAnalysisService } from '../ai-analysis/ai-analysis.service';
import { ProcurementAgentService } from './procurement-agent.service';
import { ProcurementGovernanceService, Bid } from './procurement-governance.service';
import { ProcurementPlanningService } from './procurement-planning.service';
import { ProcurementValidationService } from './procurement-validation.service';
import { VendorIntelligenceService, VendorInputs } from './vendor-intelligence.service';

/**
 * `/procurement` — Procurement Intelligence (Mr. Ayham, 2026-06-12): planning &
 * long-lead tracking, vendor intelligence, RFQ/bid governance + award, delivery
 * tracking, and the procurement governance-validation layer (run through the
 * `ext.procurement` agent). Gated on `canRunProcurement`.
 */
@Controller('procurement')
export class ProcurementController {
  constructor(
    private readonly planning: ProcurementPlanningService,
    private readonly vendors: VendorIntelligenceService,
    private readonly governance: ProcurementGovernanceService,
    private readonly validation: ProcurementValidationService,
    private readonly aiAnalysis: AiAnalysisService,
    private readonly agent: ProcurementAgentService,
  ) {}

  /** AI analysis of the project's procurement position, grounded in real
   *  procurement references (CIPS, ISO 44001/31000, FIDIC). Advisory; graceful
   *  fallback when no Claude key is configured. */
  @Post('ai-analysis')
  @HttpCode(200)
  @RequiresCapability('canRunProcurement')
  async aiAnalysisRun(@Body() body: { projectKey: string; language?: 'en' | 'ar' }): Promise<unknown> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const [packages, findings, trend] = await Promise.all([
      this.planning.list(body.projectKey),
      this.validation.list(body.projectKey),
      this.governance.costTrend(body.projectKey),
    ]);
    return this.aiAnalysis.analyse({
      domain: 'procurement',
      title: `Procurement governance — ${body.projectKey}`,
      language: body.language,
      context: {
        packages: packages.length,
        longLead: packages.filter((p) => p.longLead).length,
        findings: findings.map((f) => ({ type: f.findingType, severity: f.severity, title: f.title })),
        costTrend: { totalEstimated: trend.totalEstimated, totalAwarded: trend.totalAwarded, awardedVsEstimatedPct: trend.awardedVsEstimatedPct },
      },
    });
  }

  // ── Planning & packages ──

  @Get('packages')
  @RequiresCapability('canRunProcurement')
  listPackages(@Query('projectKey') projectKey?: string): Promise<ProcurementPackage[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.planning.list(projectKey);
  }

  @Post('packages')
  @HttpCode(200)
  @RequiresCapability('canRunProcurement')
  createPackage(@Body() body: Parameters<ProcurementPlanningService['create']>[0], @Req() req: { user?: User }): Promise<ProcurementPackage> {
    return this.planning.create({ ...body, createdBy: req.user?.displayName ?? null });
  }

  @Patch('packages/:id')
  @HttpCode(200)
  @RequiresCapability('canRunProcurement')
  updatePackage(@Param('id') id: string, @Body() body: Parameters<ProcurementPlanningService['update']>[1]): Promise<ProcurementPackage> {
    return this.planning.update(id, body);
  }

  @Get('material-plan')
  @RequiresCapability('canRunProcurement')
  materialPlan(@Query('projectKey') projectKey?: string): Promise<unknown> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.planning.materialPlanFromBim(projectKey);
  }

  @Get('long-lead')
  @RequiresCapability('canRunProcurement')
  longLead(@Query('projectKey') projectKey?: string): Promise<ProcurementPackage[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.planning.longLeadRegister(projectKey);
  }

  // ── Vendor intelligence ──

  @Get('vendors')
  @RequiresCapability('canRunProcurement')
  listVendors(@Query('category') category?: string): Promise<Vendor[]> {
    return this.vendors.list(category);
  }

  @Post('vendors')
  @HttpCode(200)
  @RequiresCapability('canRunProcurement')
  createVendor(@Body() body: { name: string; category: string; country?: string | null; inputs?: VendorInputs }, @Req() req: { user?: User }): Promise<Vendor> {
    return this.vendors.create({ ...body, createdBy: req.user?.displayName ?? null });
  }

  @Post('vendors/:id/rescore')
  @HttpCode(200)
  @RequiresCapability('canRunProcurement')
  rescoreVendor(@Param('id') id: string, @Body() body: { inputs: VendorInputs }): Promise<Vendor> {
    if (!body?.inputs) throw new BadRequestException('inputs is required');
    return this.vendors.rescore(id, body.inputs);
  }

  // ── RFQ / bid governance + award ──

  @Post('evaluate')
  @HttpCode(200)
  @RequiresCapability('canRunProcurement')
  evaluate(@Body() body: { packageId?: string; bids: Bid[] }): Promise<unknown> {
    return this.governance.evaluate(body);
  }

  @Post('packages/:id/award')
  @HttpCode(200)
  @RequiresCapability('canRunProcurement')
  award(@Param('id') id: string, @Body() body: { vendorBusinessKey: string; awardedCost: number; evaluation?: unknown }): Promise<ProcurementPackage> {
    if (!body?.vendorBusinessKey) throw new BadRequestException('vendorBusinessKey is required');
    return this.governance.award(id, body.vendorBusinessKey, body.awardedCost, body.evaluation ?? null);
  }

  @Get('cost-trend')
  @RequiresCapability('canRunProcurement')
  costTrend(@Query('projectKey') projectKey?: string): Promise<unknown> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.governance.costTrend(projectKey);
  }

  // ── Delivery tracking ──

  @Get('delivery')
  @RequiresCapability('canRunProcurement')
  delivery(@Query('projectKey') projectKey?: string, @Query('asOf') asOf?: string): Promise<unknown> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.validation.deliveryStatus(projectKey, asOf);
  }

  // ── Procurement Governance Validation (cross-source, via the agent) ──

  @Post('governance/run')
  @HttpCode(200)
  @RequiresCapability('canRunProcurement')
  async runGovernance(
    @Body() body: { projectKey: string; asOf?: string },
    @Req() req: { user?: User },
  ): Promise<{ execution: AgentExecution; findings: ProcurementFinding[] }> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const execution = await this.agent.run({
      nodeBusinessKey: body.projectKey,
      triggeredBy: req.user?.displayName ?? 'procurement-ui',
      params: { projectKey: body.projectKey, asOfDate: body.asOf },
    });
    const findings = await this.validation.list(body.projectKey, 'open');
    return { execution, findings };
  }

  @Get('governance/findings')
  @RequiresCapability('canRunProcurement')
  findings(@Query('projectKey') projectKey?: string, @Query('status') status?: string): Promise<ProcurementFinding[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.validation.list(projectKey, status);
  }

  @Post('governance/findings/:id/status')
  @HttpCode(200)
  @RequiresCapability('canRunProcurement')
  setFindingStatus(@Param('id') id: string, @Body() body: { status: string }): Promise<ProcurementFinding> {
    if (!body?.status) throw new BadRequestException('status is required');
    return this.validation.setStatus(id, body.status);
  }
}
