import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import {
  AgentExecution,
  CostEstimate,
  LifecycleLedgerEntry,
  QsFinding,
  User,
} from '../canonical/entities';
import {
  CLASSIFICATION_FRAMEWORK_VERSION,
  CLASSIFICATION_STANDARDS,
  classificationMatrix,
  classifyElement,
  ClassificationStandard,
} from './cost-classification';
import { BoqIntelligenceService } from './boq-intelligence.service';
import { MeasurementService } from './measurement.service';
import { QsGovernanceService } from './qs-governance.service';
import { QuantitySurveyAgentService } from './quantity-survey-agent.service';
import { QuantitySurveyService } from './quantity-survey.service';
import { AiAnalysisService } from '../ai-analysis/ai-analysis.service';
import { TraceabilityService } from './traceability.service';
import type { RecordInput } from './traceability.service';
import { QUANTITY_STAGES, COST_STAGES, STAGE_LABELS, STAGE_LABELS_AR } from './traceability-chains';
import type { LedgerDimension } from './traceability-chains';

/**
 * `/quantity-survey` — Quantity Survey Intelligence (Mr. Ayham, 2026-06-12):
 * the Global Cost Classification Framework, classified cost estimation, BOQ
 * intelligence, measurement & final account, and the QS governance layer
 * (run through the `ext.quantity_survey` agent so every validation is audited).
 * Gated on `canRunQuantitySurvey`.
 */
@Controller('quantity-survey')
export class QuantitySurveyController {
  constructor(
    private readonly qs: QuantitySurveyService,
    private readonly boq: BoqIntelligenceService,
    private readonly measurement: MeasurementService,
    private readonly governance: QsGovernanceService,
    private readonly traceability: TraceabilityService,
    private readonly aiAnalysis: AiAnalysisService,
    private readonly agent: QuantitySurveyAgentService,
  ) {}

  /**
   * AI analysis (Claude) of the project's QS position, grounded in the real
   * cost/QS reference library (NRM, CESMM, RICS Cost Prediction…). Advisory;
   * deterministic figures are computed elsewhere. Graceful when no key set.
   */
  @Post('ai-analysis')
  @HttpCode(200)
  @RequiresCapability('canRunQuantitySurvey')
  async aiAnalysisRun(@Body() body: { projectKey: string; language?: 'en' | 'ar' }): Promise<unknown> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const [estimates, findings, subjects] = await Promise.all([
      this.qs.list(body.projectKey),
      this.governance.list(body.projectKey),
      this.traceability.subjects(body.projectKey, 'quantity'),
    ]);
    const latest = estimates[0];
    return this.aiAnalysis.analyse({
      domain: 'quantity-survey',
      title: `Quantity Survey governance — ${body.projectKey}`,
      language: body.language,
      context: {
        latestEstimate: latest ? { stage: latest.stage, standard: latest.standard, total: latest.totalAmount, ratePerSqm: latest.ratePerSqm, currency: latest.currency } : null,
        findings: findings.map((f) => ({ type: f.findingType, severity: f.severity, title: f.title, quantum: f.quantum })),
        quantitySubjectsTracked: subjects.length,
      },
    });
  }

  // ── Global Cost Classification Framework ──

  @Get('classification/standards')
  @RequiresCapability('canRunQuantitySurvey')
  standards(): Record<string, unknown> {
    return {
      version: CLASSIFICATION_FRAMEWORK_VERSION,
      standards: CLASSIFICATION_STANDARDS,
      matrix: classificationMatrix(),
    };
  }

  @Post('classify')
  @HttpCode(200)
  @RequiresCapability('canRunQuantitySurvey')
  classify(@Body() body: { label: string; standard?: ClassificationStandard }): ReturnType<typeof classifyElement> {
    if (!body?.label) throw new BadRequestException('label is required');
    return classifyElement(body.label, body.standard ?? 'NRM');
  }

  // ── Cost estimation (Conceptual Cost Plans / Cost Breakdown Structures) ──

  @Post('estimates')
  @HttpCode(200)
  @RequiresCapability('canRunQuantitySurvey')
  createEstimate(
    @Body() body: {
      projectKey: string; stage: string; projectType: string; areaSqm: number;
      standard?: ClassificationStandard; currency?: string; city?: string | null; country?: string | null; title?: string;
    },
    @Req() req: { user?: User },
  ): Promise<CostEstimate> {
    return this.qs.createEstimate({ ...body, createdBy: req.user?.displayName ?? null });
  }

  @Post('estimates/from-bim')
  @HttpCode(200)
  @RequiresCapability('canRunQuantitySurvey')
  async estimateFromBim(
    @Body() body: { projectKey: string; stage?: string; projectType: string; standard?: ClassificationStandard; currency?: string },
    @Req() req: { user?: User },
  ): Promise<CostEstimate> {
    const gen = await this.boq.generateFromBim({
      projectKey: body.projectKey, projectType: body.projectType, standard: body.standard, currency: body.currency,
    });
    return this.qs.createFromQuantities({
      projectKey: body.projectKey,
      stage: body.stage ?? 'cost-plan',
      projectType: body.projectType,
      quantities: gen.lines.map((l) => ({ element: l.element, quantity: l.quantity })),
      standard: body.standard,
      currency: body.currency,
      createdBy: req.user?.displayName ?? null,
    });
  }

  @Get('estimates')
  @RequiresCapability('canRunQuantitySurvey')
  listEstimates(@Query('projectKey') projectKey?: string): Promise<CostEstimate[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.qs.list(projectKey);
  }

  @Get('estimates/:id')
  @RequiresCapability('canRunQuantitySurvey')
  getEstimate(@Param('id') id: string): Promise<CostEstimate> {
    return this.qs.get(id);
  }

  // ── BOQ intelligence (tender stage) ──

  @Post('boq/generate')
  @HttpCode(200)
  @RequiresCapability('canRunQuantitySurvey')
  generateBoq(@Body() body: { projectKey: string; projectType: string; standard?: ClassificationStandard; currency?: string }): Promise<unknown> {
    if (!body?.projectKey || !body?.projectType) throw new BadRequestException('projectKey and projectType are required');
    return this.boq.generateFromBim(body);
  }

  @Post('boq/:boqKey/validate')
  @HttpCode(200)
  @RequiresCapability('canRunQuantitySurvey')
  validateBoq(@Param('boqKey') boqKey: string, @Body() body: { standard?: ClassificationStandard }): Promise<unknown> {
    return this.boq.validate(boqKey, body?.standard ?? 'NRM');
  }

  @Post('boq/compare-bids')
  @HttpCode(200)
  @RequiresCapability('canRunQuantitySurvey')
  compareBids(@Body() body: {
    items: Array<{ itemNumber: string; description: string; quantity: number }>;
    bids: Array<{ bidder: string; rates: Record<string, number> }>;
  }): unknown {
    return this.boq.compareBids(body);
  }

  // ── Measurement (post-contract) ──

  @Post('measurement/interim')
  @HttpCode(200)
  @RequiresCapability('canRunQuantitySurvey')
  interim(@Body() body: { boqBusinessKey: string; measuredPct: Record<string, number>; retentionPct?: number; previouslyCertified?: number }): Promise<unknown> {
    if (!body?.boqBusinessKey) throw new BadRequestException('boqBusinessKey is required');
    return this.measurement.interimValuation(body);
  }

  @Post('measurement/final-account')
  @HttpCode(200)
  @RequiresCapability('canRunQuantitySurvey')
  finalAccount(@Body() body: { boqBusinessKey: string; variations?: Array<{ ref: string; description: string; amount: number }> }): Promise<unknown> {
    if (!body?.boqBusinessKey) throw new BadRequestException('boqBusinessKey is required');
    return this.measurement.finalAccount(body);
  }

  @Post('measurement/forecast')
  @HttpCode(200)
  @RequiresCapability('canRunQuantitySurvey')
  forecast(@Body() body: { contractTotal: number; certifiedToDate: number; physicalProgressPct: number }): unknown {
    return this.measurement.forecast(body);
  }

  // ── QS Governance Layer (cross-source validation, via the agent) ──

  @Post('governance/run')
  @HttpCode(200)
  @RequiresCapability('canRunQuantitySurvey')
  async runGovernance(
    @Body() body: { projectKey: string },
    @Req() req: { user?: User },
  ): Promise<{ execution: AgentExecution; findings: QsFinding[] }> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const execution = await this.agent.run({
      nodeBusinessKey: body.projectKey,
      triggeredBy: req.user?.displayName ?? 'quantity-survey-ui',
      params: { projectKey: body.projectKey },
    });
    const findings = await this.governance.list(body.projectKey, 'open');
    return { execution, findings };
  }

  @Get('governance/findings')
  @RequiresCapability('canRunQuantitySurvey')
  findings(@Query('projectKey') projectKey?: string, @Query('status') status?: string): Promise<QsFinding[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.governance.list(projectKey, status);
  }

  @Post('governance/findings/:id/status')
  @HttpCode(200)
  @RequiresCapability('canRunQuantitySurvey')
  setFindingStatus(@Param('id') id: string, @Body() body: { status: string }): Promise<QsFinding> {
    if (!body?.status) throw new BadRequestException('status is required');
    return this.governance.setStatus(id, body.status);
  }

  // ── Quantity / Cost Governance traceability (the lifecycle ledger) ──

  @Get('traceability/chains')
  @RequiresCapability('canRunQuantitySurvey')
  chains(): Record<string, unknown> {
    return {
      quantity: { stages: QUANTITY_STAGES, labels: STAGE_LABELS, labelsAr: STAGE_LABELS_AR },
      cost: { stages: COST_STAGES, labels: STAGE_LABELS, labelsAr: STAGE_LABELS_AR },
    };
  }

  @Post('traceability/record')
  @HttpCode(200)
  @RequiresCapability('canRunQuantitySurvey')
  recordStage(@Body() body: Omit<RecordInput, 'recordedBy'>, @Req() req: { user?: User }): Promise<LifecycleLedgerEntry> {
    return this.traceability.record({ ...body, recordedBy: req.user?.displayName ?? null });
  }

  @Get('traceability/subjects')
  @RequiresCapability('canRunQuantitySurvey')
  subjects(@Query('projectKey') projectKey?: string, @Query('dimension') dimension?: LedgerDimension): Promise<unknown> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.traceability.subjects(projectKey, dimension);
  }

  @Get('traceability/chain')
  @RequiresCapability('canRunQuantitySurvey')
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

  @Get('traceability/history')
  @RequiresCapability('canRunQuantitySurvey')
  ledgerHistory(
    @Query('projectKey') projectKey?: string,
    @Query('dimension') dimension?: LedgerDimension,
    @Query('subjectKey') subjectKey?: string,
    @Query('stage') stage?: string,
  ): Promise<LifecycleLedgerEntry[]> {
    if (!projectKey || !dimension || !subjectKey || !stage) {
      throw new BadRequestException('projectKey, dimension, subjectKey and stage are all required');
    }
    return this.traceability.history(projectKey, dimension, subjectKey, stage);
  }

  @Post('traceability/validate')
  @HttpCode(200)
  @RequiresCapability('canRunQuantitySurvey')
  validateChains(@Body() body: { projectKey: string }): Promise<unknown> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    return this.traceability.validate(body.projectKey);
  }
}
