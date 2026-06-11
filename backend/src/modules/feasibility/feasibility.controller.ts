import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { RequiresCapability } from '../auth/require-capability.decorator';
import {
  AgentExecution,
  ConceptDocument,
  FeasibilityAssessment,
  FeasibilityStudySection,
  InvestmentOpportunity,
  User,
} from '../canonical/entities';
import {
  ASSUMPTION_LIBRARY_VERSION,
  LOCATION_FACTORS,
  PROJECT_TYPE_ASSUMPTIONS,
} from './assumption-library';
import { BankabilityService, PACKAGE_SECTIONS, STUDY_SECTIONS } from './bankability.service';
import { ConceptIntakeService } from './concept-intake.service';
import type { ConceptFields } from './concept-intake.service';
import { FeasibilityService } from './feasibility.service';
import type { CreateOpportunityInput, UpdateOpportunityInput } from './feasibility.service';
import { InvestmentAgentService } from './investment-agent.service';
import { RapidAssessmentService } from './rapid-assessment.service';

interface UploadConceptBody {
  filename: string;
  mimeType: string;
  contentBase64: string;
}

/**
 * `/feasibility` — the Investment & Feasibility Intelligence surface
 * (Mr. Ayham, 2026-06-11 follow-up).
 *
 * Level 1: POST /opportunities + POST /opportunities/:id/assess (runs through
 * the `ext.investment` agent so every assessment is a fully audited
 * AgentExecution). Level 2: study generation, section approval and audience
 * packages. Concept sketches: upload → extract (AI proposal) → confirm
 * (human gate). Gated on `canRunFeasibility` — pre-project investment data is
 * not visible to delivery-side roles.
 */
@Controller('feasibility')
export class FeasibilityController {
  constructor(
    private readonly feasibility: FeasibilityService,
    private readonly rapid: RapidAssessmentService,
    private readonly bankability: BankabilityService,
    private readonly intake: ConceptIntakeService,
    private readonly agent: InvestmentAgentService,
  ) {}

  /** The reference assumption library — full transparency of the benchmarks. */
  @Get('assumptions')
  @RequiresCapability('canRunFeasibility')
  assumptions(): Record<string, unknown> {
    return {
      version: ASSUMPTION_LIBRARY_VERSION,
      projectTypes: PROJECT_TYPE_ASSUMPTIONS,
      locationFactors: LOCATION_FACTORS,
      studySections: STUDY_SECTIONS,
      packages: PACKAGE_SECTIONS,
    };
  }

  @Get('opportunities')
  @RequiresCapability('canRunFeasibility')
  list(): Promise<unknown[]> {
    return this.feasibility.list();
  }

  @Post('opportunities')
  @HttpCode(200)
  @RequiresCapability('canRunFeasibility')
  create(
    @Body() body: CreateOpportunityInput,
    @Req() req: { user?: User },
  ): Promise<InvestmentOpportunity> {
    return this.feasibility.create({ ...body, createdBy: req.user?.displayName ?? null });
  }

  @Get('opportunities/:id')
  @RequiresCapability('canRunFeasibility')
  get(@Param('id') id: string): Promise<unknown> {
    return this.feasibility.get(id);
  }

  @Patch('opportunities/:id')
  @HttpCode(200)
  @RequiresCapability('canRunFeasibility')
  update(@Param('id') id: string, @Body() body: UpdateOpportunityInput): Promise<InvestmentOpportunity> {
    return this.feasibility.update(id, body);
  }

  /**
   * Level 1 — run the rapid investment assessment THROUGH the agent contract:
   * the run opens an AgentExecution audit row, persists confidence, emits the
   * outbox event, and returns the full assessment.
   */
  @Post('opportunities/:id/assess')
  @HttpCode(200)
  @RequiresCapability('canRunFeasibility')
  async assess(
    @Param('id') id: string,
    @Req() req: { user?: User },
  ): Promise<{ execution: AgentExecution; assessment: FeasibilityAssessment | null }> {
    const execution = await this.agent.run({
      triggeredBy: req.user?.displayName ?? 'feasibility-ui',
      params: { opportunityId: id },
    });
    const assessment = await this.rapid.latest(id);
    return { execution, assessment };
  }

  @Get('opportunities/:id/assessments')
  @RequiresCapability('canRunFeasibility')
  history(@Param('id') id: string): Promise<FeasibilityAssessment[]> {
    return this.rapid.history(id);
  }

  /** Level 2 — generate (or regenerate) the 17-section professional study. */
  @Post('opportunities/:id/study/generate')
  @HttpCode(200)
  @Throttle({ ingest: { limit: 10, ttl: 60_000 } })
  @RequiresCapability('canRunFeasibility')
  generateStudy(
    @Param('id') id: string,
    @Req() req: { user?: User },
  ): Promise<FeasibilityStudySection[]> {
    return this.bankability.generateStudy(id, req.user?.displayName ?? null);
  }

  @Get('opportunities/:id/study')
  @RequiresCapability('canRunFeasibility')
  study(@Param('id') id: string): Promise<FeasibilityStudySection[]> {
    return this.bankability.getStudy(id);
  }

  @Post('opportunities/:id/study/:sectionKey/approve')
  @HttpCode(200)
  @RequiresCapability('canRunFeasibility')
  approveSection(
    @Param('id') id: string,
    @Param('sectionKey') sectionKey: string,
    @Req() req: { user?: User },
  ): Promise<FeasibilityStudySection> {
    return this.bankability.approveSection(id, sectionKey, req.user?.displayName ?? null);
  }

  /** Audience package: investor | partner | bank. */
  @Get('opportunities/:id/package/:audience')
  @RequiresCapability('canRunFeasibility')
  composePackage(@Param('id') id: string, @Param('audience') audience: string): Promise<unknown> {
    return this.bankability.composePackage(id, audience);
  }

  // ── Concept sketches / preliminary drawings ──

  @Post('opportunities/:id/documents')
  @HttpCode(200)
  @Throttle({ ingest: { limit: 30, ttl: 60_000 } })
  @RequiresCapability('canRunFeasibility')
  uploadDocument(
    @Param('id') id: string,
    @Body() body: UploadConceptBody,
    @Req() req: { user?: User },
  ): Promise<ConceptDocument> {
    if (!body?.filename) throw new BadRequestException('filename is required');
    if (!body?.mimeType) throw new BadRequestException('mimeType is required');
    if (!body?.contentBase64) throw new BadRequestException('contentBase64 is required');
    return this.intake.upload({
      opportunityId: id,
      filename: body.filename,
      mimeType: body.mimeType,
      contentBase64: body.contentBase64,
      uploadedBy: req.user?.displayName ?? null,
    });
  }

  @Get('opportunities/:id/documents')
  @RequiresCapability('canRunFeasibility')
  listDocuments(@Param('id') id: string): Promise<ConceptDocument[]> {
    return this.intake.list(id);
  }

  /** AI vision/OCR extraction — proposal only, nothing applied yet. */
  @Post('documents/:docId/extract')
  @HttpCode(200)
  @Throttle({ ingest: { limit: 10, ttl: 60_000 } })
  @RequiresCapability('canRunFeasibility')
  extract(@Param('docId') docId: string): Promise<ConceptDocument> {
    return this.intake.extract(docId);
  }

  /** Human approval gate — merges reviewed fields into the opportunity inputs. */
  @Post('documents/:docId/confirm')
  @HttpCode(200)
  @RequiresCapability('canRunFeasibility')
  confirm(
    @Param('docId') docId: string,
    @Body() body: { fields: ConceptFields },
    @Req() req: { user?: User },
  ): Promise<ConceptDocument> {
    if (!body?.fields || typeof body.fields !== 'object') {
      throw new BadRequestException('fields object is required');
    }
    return this.intake.confirm(docId, body.fields, req.user?.displayName ?? null);
  }
}
