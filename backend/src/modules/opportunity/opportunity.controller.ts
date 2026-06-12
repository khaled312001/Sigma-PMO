import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { AgentExecution, OpportunityScreening, User } from '../canonical/entities';
import { AiAnalysisService } from '../ai-analysis/ai-analysis.service';
import { OpportunityAgentService } from './opportunity-agent.service';
import { OpportunityIntelligenceService } from './opportunity-intelligence.service';
import { MarketIntelligenceService } from './market-intelligence.service';

interface CreateScreeningBody {
  title: string;
  projectType: string;
  country?: string | null;
  city?: string | null;
  estimatedInvestment?: number | null;
  currency?: string;
  businessObjective?: string | null;
  fundingStructure?: string | null;
}

/**
 * `/opportunity` — Opportunity Intelligence + Market Intelligence (Mr. Ayham,
 * 2026-06-12 active scope): the FIRST gate of the investment lifecycle. Create
 * a screening (deterministically scored 0–100 + runs the `ext.opportunity`
 * agent), list/inspect screenings, read the market snapshot, and get an AI
 * narrative grounded in the real feasibility reference library. Gated on
 * `canRunOpportunity`.
 */
@Controller('opportunity')
export class OpportunityController {
  constructor(
    private readonly intelligence: OpportunityIntelligenceService,
    private readonly market: MarketIntelligenceService,
    private readonly aiAnalysis: AiAnalysisService,
    private readonly agent: OpportunityAgentService,
  ) {}

  /** The project types the screener accepts (Sigma assumption-library keys). */
  @Get('project-types')
  @RequiresCapability('canRunOpportunity')
  projectTypes(): { projectTypes: string[] } {
    return { projectTypes: this.intelligence.projectTypes() };
  }

  /** Create a screening, persist its deterministic scores, and run the agent. */
  @Post('screenings')
  @HttpCode(201)
  @RequiresCapability('canRunOpportunity')
  async createScreening(
    @Body() body: CreateScreeningBody,
    @Req() req: { user?: User },
  ): Promise<{ screening: OpportunityScreening; execution: AgentExecution }> {
    if (!body?.title?.trim()) throw new BadRequestException('title is required');
    if (!body?.projectType?.trim()) throw new BadRequestException('projectType is required');

    const screening = await this.intelligence.createScreening({
      title: body.title.trim(),
      projectType: body.projectType,
      country: body.country ?? null,
      city: body.city ?? null,
      estimatedInvestment:
        body.estimatedInvestment != null ? Number(body.estimatedInvestment) : null,
      currency: body.currency,
      businessObjective: body.businessObjective ?? null,
      fundingStructure: body.fundingStructure ?? null,
      createdBy: req.user?.displayName ?? null,
    });

    const execution = await this.agent.run({
      nodeBusinessKey: screening.code,
      triggeredBy: req.user?.displayName ?? 'opportunity-ui',
      params: { screeningId: screening.id },
    });

    return { screening, execution };
  }

  @Get('screenings')
  @RequiresCapability('canRunOpportunity')
  list(): Promise<OpportunityScreening[]> {
    return this.intelligence.list();
  }

  @Get('screenings/:id')
  @RequiresCapability('canRunOpportunity')
  async get(@Param('id') id: string): Promise<OpportunityScreening> {
    const row = await this.intelligence.get(id);
    if (!row) throw new NotFoundException(`Opportunity screening ${id} not found`);
    return row;
  }

  /** Market snapshot for a (project type, location) — deterministic. */
  @Get('market')
  @RequiresCapability('canRunOpportunity')
  market_(
    @Query('projectType') projectType?: string,
    @Query('city') city?: string,
    @Query('country') country?: string,
  ): unknown {
    if (!projectType) throw new BadRequestException('projectType query parameter is required');
    return this.market.marketSnapshot(projectType, city ?? null, country ?? null);
  }

  /** AI analysis of an opportunity, grounded in the real feasibility references.
   *  Advisory; graceful fallback when no Claude key is configured. */
  @Post('ai-analysis')
  @HttpCode(200)
  @RequiresCapability('canRunOpportunity')
  async aiAnalysisRun(
    @Body()
    body: { screeningId?: string; projectType?: string; city?: string; country?: string; projectKey?: string; language?: 'en' | 'ar' },
  ): Promise<unknown> {
    let title = 'Opportunity intelligence';
    let context: Record<string, unknown>;

    if (body?.screeningId) {
      const s = await this.intelligence.get(body.screeningId);
      if (!s) throw new NotFoundException(`Opportunity screening ${body.screeningId} not found`);
      title = `Opportunity intelligence — ${s.code} ${s.title}`;
      context = {
        code: s.code,
        title: s.title,
        projectType: s.projectType,
        location: { city: s.city, country: s.country },
        estimatedInvestment: s.estimatedInvestment,
        currency: s.currency,
        opportunityScore: s.opportunityScore,
        recommendation: s.recommendation,
        governanceStatus: s.governanceStatus,
        scores: s.scores,
        inputs: s.inputs,
        market: this.market.marketSnapshot(s.projectType, s.city, s.country),
      };
    } else {
      const pt = body?.projectType ?? 'mixed_use';
      const scores = this.intelligence.computeScores(pt, body?.city ?? null, body?.country ?? null);
      title = `Opportunity intelligence — ${pt}`;
      context = {
        projectKey: body?.projectKey ?? null,
        projectType: pt,
        location: { city: body?.city ?? null, country: body?.country ?? null },
        scores,
        recommendation: this.intelligence.recommend(scores.opportunityScore),
        market: this.market.marketSnapshot(pt, body?.city ?? null, body?.country ?? null),
      };
    }

    return this.aiAnalysis.analyse({
      domain: 'feasibility',
      title,
      language: body?.language,
      context,
    });
  }
}
