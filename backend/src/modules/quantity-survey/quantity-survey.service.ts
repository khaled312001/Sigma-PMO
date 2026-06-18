import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CostEstimate } from '../canonical/entities';
import { ProjectOwnershipService } from '../canonical/project-ownership.service';
import { ClassificationStandard } from './cost-classification';
import { CostEstimationService } from './cost-estimation.service';

const STAGES = new Set(['conceptual', 'budget', 'cost-plan', 'tender', 'forecast', 'final-account']);

/**
 * QuantitySurveyService — the CostEstimate lifecycle facade: create classified
 * estimates (append-only, versioned per stage) and list/read them. Computation
 * lives in CostEstimationService; this owns persistence + the BIM→Quantity→Cost
 * structured outputs (Conceptual Cost Plans, Cost Breakdown Structures).
 */
@Injectable()
export class QuantitySurveyService {
  constructor(
    @InjectRepository(CostEstimate) private readonly estimates: Repository<CostEstimate>,
    private readonly estimation: CostEstimationService,
    private readonly ownership?: ProjectOwnershipService,
  ) {}

  async createEstimate(input: {
    projectKey: string;
    stage: string;
    projectType: string;
    areaSqm: number;
    standard?: ClassificationStandard;
    currency?: string;
    city?: string | null;
    country?: string | null;
    title?: string;
    createdBy?: string | null;
  }): Promise<CostEstimate> {
    if (!input.projectKey?.trim()) throw new BadRequestException('projectKey is required');
    if (!STAGES.has(input.stage)) throw new BadRequestException(`stage must be one of: ${[...STAGES].join(', ')}`);

    const model = this.estimation.estimate({
      projectType: input.projectType,
      areaSqm: input.areaSqm,
      standard: input.standard,
      currency: input.currency,
      city: input.city,
      country: input.country,
      stage: input.stage,
    });

    // Version per (project, stage): flip current, insert new.
    const priors = await this.estimates.find({
      where: { projectBusinessKey: input.projectKey, stage: input.stage, isCurrent: true },
    });
    for (const p of priors) { p.isCurrent = false; await this.estimates.save(p); }
    const version = priors.length ? Math.max(...priors.map((p) => p.version)) + 1 : 1;

    return this.estimates.save(this.estimates.create({
      projectBusinessKey: input.projectKey,
      stage: input.stage,
      title: input.title?.trim() || `${cap(input.stage)} cost estimate — ${input.projectType}`,
      standard: model.standard,
      method: model.method,
      currency: model.currency,
      areaSqm: model.areaSqm !== null ? String(model.areaSqm) : null,
      totalAmount: String(model.totalAmount),
      ratePerSqm: model.ratePerSqm !== null ? String(model.ratePerSqm) : null,
      elements: model.elements as unknown as Array<Record<string, unknown>>,
      benchmark: model.benchmark as unknown as Record<string, unknown>,
      confidence: model.confidence,
      version,
      isCurrent: true,
      createdBy: input.createdBy ?? null,
    }));
  }

  /** Persist a classified estimate built from BIM-derived quantities. */
  async createFromQuantities(input: {
    projectKey: string;
    stage: string;
    projectType: string;
    quantities: Array<{ element: string; quantity: number }>;
    standard?: ClassificationStandard;
    currency?: string;
    title?: string;
    createdBy?: string | null;
  }): Promise<CostEstimate> {
    if (!STAGES.has(input.stage)) throw new BadRequestException(`stage must be one of: ${[...STAGES].join(', ')}`);
    const model = this.estimation.estimateFromQuantities({
      quantities: input.quantities,
      projectType: input.projectType,
      standard: input.standard,
      currency: input.currency,
    });
    const priors = await this.estimates.find({
      where: { projectBusinessKey: input.projectKey, stage: input.stage, isCurrent: true },
    });
    for (const p of priors) { p.isCurrent = false; await this.estimates.save(p); }
    const version = priors.length ? Math.max(...priors.map((p) => p.version)) + 1 : 1;
    return this.estimates.save(this.estimates.create({
      projectBusinessKey: input.projectKey,
      stage: input.stage,
      title: input.title?.trim() || `${cap(input.stage)} estimate (BIM quantities) — ${input.projectType}`,
      standard: model.standard,
      method: model.method,
      currency: model.currency,
      areaSqm: null,
      totalAmount: String(model.totalAmount),
      ratePerSqm: model.ratePerSqm !== null ? String(model.ratePerSqm) : null,
      elements: model.elements as unknown as Array<Record<string, unknown>>,
      benchmark: model.benchmark as unknown as Record<string, unknown>,
      confidence: model.confidence,
      version,
      isCurrent: true,
      createdBy: input.createdBy ?? null,
    }));
  }

  list(projectKey: string): Promise<CostEstimate[]> {
    return this.estimates.find({
      where: { projectBusinessKey: projectKey, isCurrent: true },
      order: { createdAt: 'DESC' },
    });
  }

  async get(id: string): Promise<CostEstimate> {
    const e = await this.estimates.findOne({ where: { id } });
    if (!e) throw new NotFoundException(`Cost estimate ${id} not found`);
    await this.ownership?.assertOwns(e.projectBusinessKey); // multi-tenant ownership
    return e;
  }
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
