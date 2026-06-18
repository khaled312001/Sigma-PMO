import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { companyScope, currentCompanyId } from '../../common/tenant/tenant-context';
import {
  ConceptDocument,
  FeasibilityAssessment,
  FeasibilityStudySection,
  InvestmentOpportunity,
} from '../canonical/entities';
import { PROJECT_TYPE_ASSUMPTIONS, PROJECT_TYPES } from './assumption-library';

export interface CreateOpportunityInput {
  title: string;
  projectType: string;
  country?: string | null;
  city?: string | null;
  estimatedInvestment?: number | null;
  currency?: string;
  fundingStructure?: Record<string, unknown>;
  businessObjective?: string | null;
  inputs?: Record<string, unknown>;
  createdBy?: string | null;
}

export interface UpdateOpportunityInput {
  title?: string;
  projectType?: string;
  country?: string | null;
  city?: string | null;
  estimatedInvestment?: number | null;
  currency?: string;
  fundingStructure?: Record<string, unknown>;
  businessObjective?: string | null;
  inputs?: Record<string, unknown>;
  stage?: string;
}

const STAGES = new Set(['idea', 'assessed', 'study', 'approved', 'rejected', 'hold']);

/**
 * FeasibilityService — lifecycle of `InvestmentOpportunity` rows (the inputs
 * side of the capability). All computation lives in RapidAssessmentService /
 * BankabilityService; this service owns creation (INV-#### codes), listing
 * with the latest assessment headline, and guarded updates.
 */
@Injectable()
export class FeasibilityService {
  constructor(
    @InjectRepository(InvestmentOpportunity)
    private readonly opportunities: Repository<InvestmentOpportunity>,
    @InjectRepository(FeasibilityAssessment)
    private readonly assessments: Repository<FeasibilityAssessment>,
    @InjectRepository(FeasibilityStudySection)
    private readonly sections: Repository<FeasibilityStudySection>,
    @InjectRepository(ConceptDocument)
    private readonly docs: Repository<ConceptDocument>,
  ) {}

  async create(input: CreateOpportunityInput): Promise<InvestmentOpportunity> {
    if (!input.title?.trim()) throw new BadRequestException('title is required');
    if (!PROJECT_TYPE_ASSUMPTIONS[input.projectType]) {
      throw new BadRequestException(
        `Unknown projectType "${input.projectType}". Known: ${PROJECT_TYPES.join(', ')}`,
      );
    }
    const count = await this.opportunities.count();
    const code = `INV-${String(count + 1).padStart(4, '0')}`;
    return this.opportunities.save(
      this.opportunities.create({
        companyId: currentCompanyId(),
        code,
        title: input.title.trim(),
        projectType: input.projectType,
        country: input.country ?? null,
        city: input.city ?? null,
        estimatedInvestment:
          input.estimatedInvestment != null ? String(input.estimatedInvestment) : null,
        currency: input.currency?.trim() || 'AED',
        fundingStructure: input.fundingStructure ?? { equityPct: 0.4, debtPct: 0.6, interestRatePct: 0.06, tenorYears: 15 },
        businessObjective: input.businessObjective ?? null,
        stage: 'idea',
        inputs: input.inputs ?? {},
        createdBy: input.createdBy ?? null,
      }),
    );
  }

  /** List with the latest assessment headline stitched on (single query each). */
  async list(): Promise<Array<InvestmentOpportunity & { latestAssessment: Partial<FeasibilityAssessment> | null }>> {
    const opps = await this.opportunities.find({ where: { ...companyScope() }, order: { createdAt: 'DESC' } });
    if (!opps.length) return [];
    const latest = await this.assessments
      .createQueryBuilder('a')
      .where('a.opportunityId IN (:...ids)', { ids: opps.map((o) => o.id) })
      .orderBy('a.createdAt', 'DESC')
      .getMany();
    const byOpp = new Map<string, FeasibilityAssessment>();
    for (const a of latest) if (!byOpp.has(a.opportunityId)) byOpp.set(a.opportunityId, a);
    return opps.map((o) => {
      const a = byOpp.get(o.id);
      return Object.assign(o, {
        latestAssessment: a
          ? {
              id: a.id,
              createdAt: a.createdAt,
              recommendation: a.recommendation,
              riskRating: a.riskRating,
              governanceStatus: a.governanceStatus,
              confidence: a.confidence,
              results: {
                npv: (a.results as Record<string, unknown>).npv,
                projectIrr: (a.results as Record<string, unknown>).projectIrr,
                paybackYears: (a.results as Record<string, unknown>).paybackYears,
                attractivenessScore: (a.results as Record<string, unknown>).attractivenessScore,
              } as Record<string, unknown>,
            }
          : null,
      });
    });
  }

  async get(id: string): Promise<{
    opportunity: InvestmentOpportunity;
    latestAssessment: FeasibilityAssessment | null;
    sections: FeasibilityStudySection[];
    documents: ConceptDocument[];
  }> {
    const opportunity = await this.opportunities.findOne({ where: { id, ...companyScope() } });
    if (!opportunity) throw new NotFoundException(`Opportunity ${id} not found`);
    const [assessRows, sections, documents] = await Promise.all([
      this.assessments.find({ where: { opportunityId: id }, order: { createdAt: 'DESC' }, take: 1 }),
      this.sections.find({ where: { opportunityId: id, isCurrent: true } }),
      this.docs.find({ where: { opportunityId: id }, order: { createdAt: 'DESC' } }),
    ]);
    return { opportunity, latestAssessment: assessRows[0] ?? null, sections, documents };
  }

  async update(id: string, input: UpdateOpportunityInput): Promise<InvestmentOpportunity> {
    const opp = await this.opportunities.findOne({ where: { id, ...companyScope() } });
    if (!opp) throw new NotFoundException(`Opportunity ${id} not found`);
    if (input.title !== undefined) {
      if (!input.title.trim()) throw new BadRequestException('title cannot be empty');
      opp.title = input.title.trim();
    }
    if (input.projectType !== undefined) {
      if (!PROJECT_TYPE_ASSUMPTIONS[input.projectType]) {
        throw new BadRequestException(`Unknown projectType "${input.projectType}"`);
      }
      opp.projectType = input.projectType;
    }
    if (input.country !== undefined) opp.country = input.country;
    if (input.city !== undefined) opp.city = input.city;
    if (input.estimatedInvestment !== undefined) {
      opp.estimatedInvestment =
        input.estimatedInvestment != null ? String(input.estimatedInvestment) : null;
    }
    if (input.currency !== undefined) opp.currency = input.currency.trim() || 'AED';
    if (input.fundingStructure !== undefined) opp.fundingStructure = input.fundingStructure;
    if (input.businessObjective !== undefined) opp.businessObjective = input.businessObjective;
    if (input.inputs !== undefined) opp.inputs = { ...(opp.inputs ?? {}), ...input.inputs };
    if (input.stage !== undefined) {
      if (!STAGES.has(input.stage)) {
        throw new BadRequestException(`stage must be one of: ${[...STAGES].join(', ')}`);
      }
      opp.stage = input.stage;
    }
    return this.opportunities.save(opp);
  }
}
