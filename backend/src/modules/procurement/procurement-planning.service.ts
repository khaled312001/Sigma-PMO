import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ProcurementPackage, ProjectRecord } from '../canonical/entities';
import { classifyElement } from '../quantity-survey/cost-classification';
import { BimCounts, deriveQuantitiesFromBim } from '../quantity-survey/bim-quantities';

/**
 * ProcurementPlanningService — package lifecycle, long-lead tracking, and
 * material planning derived from the BIM model (Mr. Ayham's Procurement
 * Planning, 2026-06-12). Packages carry the three quantities the cross-source
 * validation compares (BIM / procured / installed). Append-only by businessKey.
 */
@Injectable()
export class ProcurementPlanningService {
  constructor(
    @InjectRepository(ProcurementPackage) private readonly packages: Repository<ProcurementPackage>,
    @InjectRepository(ProjectRecord) private readonly records: Repository<ProjectRecord>,
  ) {}

  async create(input: {
    projectKey: string;
    title: string;
    category: string;
    element?: string | null;
    unit?: string | null;
    strategy?: string | null;
    longLead?: boolean;
    leadTimeDays?: number | null;
    requiredOnSiteDate?: string | null;
    plannedDeliveryDate?: string | null;
    actualDeliveryDate?: string | null;
    bimQuantity?: number | null;
    procuredQuantity?: number | null;
    installedQuantity?: number | null;
    status?: string;
    estimatedCost?: number | null;
    currency?: string;
    createdBy?: string | null;
  }): Promise<ProcurementPackage> {
    if (!input.projectKey?.trim()) throw new BadRequestException('projectKey is required');
    if (!input.title?.trim()) throw new BadRequestException('title is required');
    if (!input.category?.trim()) throw new BadRequestException('category is required');
    const count = await this.packages.count({ where: { projectBusinessKey: input.projectKey } });
    const businessKey = `PKG-${String(count + 1).padStart(3, '0')}`;
    const element = input.element ?? classifyElement(`${input.title} ${input.category}`).element;
    return this.packages.save(this.packages.create({
      projectBusinessKey: input.projectKey,
      businessKey,
      title: input.title.trim(),
      category: input.category.trim(),
      element: element === 'other' ? null : element,
      unit: input.unit ?? null,
      status: input.status ?? 'planned',
      strategy: input.strategy ?? null,
      longLead: !!input.longLead,
      leadTimeDays: input.leadTimeDays ?? null,
      requiredOnSiteDate: input.requiredOnSiteDate ?? null,
      plannedDeliveryDate: input.plannedDeliveryDate ?? null,
      actualDeliveryDate: input.actualDeliveryDate ?? null,
      bimQuantity: input.bimQuantity != null ? String(input.bimQuantity) : null,
      procuredQuantity: input.procuredQuantity != null ? String(input.procuredQuantity) : null,
      installedQuantity: input.installedQuantity != null ? String(input.installedQuantity) : null,
      awardedVendorBusinessKey: null,
      estimatedCost: input.estimatedCost != null ? String(input.estimatedCost) : null,
      awardedCost: null,
      currency: input.currency?.trim() || 'AED',
      details: null,
      version: 1,
      isCurrent: true,
      createdBy: input.createdBy ?? null,
    }));
  }

  /** Patch mutable fields (quantities, dates, status, award). */
  async update(id: string, patch: Partial<{
    status: string; strategy: string | null; longLead: boolean; leadTimeDays: number | null;
    requiredOnSiteDate: string | null; plannedDeliveryDate: string | null; actualDeliveryDate: string | null;
    bimQuantity: number | null; procuredQuantity: number | null; installedQuantity: number | null;
    awardedVendorBusinessKey: string | null; awardedCost: number | null;
  }>): Promise<ProcurementPackage> {
    const p = await this.packages.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Package ${id} not found`);
    if (patch.status !== undefined) p.status = patch.status;
    if (patch.strategy !== undefined) p.strategy = patch.strategy;
    if (patch.longLead !== undefined) p.longLead = patch.longLead;
    if (patch.leadTimeDays !== undefined) p.leadTimeDays = patch.leadTimeDays;
    if (patch.requiredOnSiteDate !== undefined) p.requiredOnSiteDate = patch.requiredOnSiteDate;
    if (patch.plannedDeliveryDate !== undefined) p.plannedDeliveryDate = patch.plannedDeliveryDate;
    if (patch.actualDeliveryDate !== undefined) p.actualDeliveryDate = patch.actualDeliveryDate;
    if (patch.bimQuantity !== undefined) p.bimQuantity = patch.bimQuantity != null ? String(patch.bimQuantity) : null;
    if (patch.procuredQuantity !== undefined) p.procuredQuantity = patch.procuredQuantity != null ? String(patch.procuredQuantity) : null;
    if (patch.installedQuantity !== undefined) p.installedQuantity = patch.installedQuantity != null ? String(patch.installedQuantity) : null;
    if (patch.awardedVendorBusinessKey !== undefined) p.awardedVendorBusinessKey = patch.awardedVendorBusinessKey;
    if (patch.awardedCost !== undefined) p.awardedCost = patch.awardedCost != null ? String(patch.awardedCost) : null;
    return this.packages.save(p);
  }

  list(projectKey: string): Promise<ProcurementPackage[]> {
    return this.packages.find({ where: { projectBusinessKey: projectKey, isCurrent: true }, order: { createdAt: 'DESC' } });
  }

  async get(id: string): Promise<ProcurementPackage> {
    const p = await this.packages.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Package ${id} not found`);
    return p;
  }

  /**
   * Material planning from the BIM model: derive element quantities and propose
   * one procurement package per element (BIM → material need). Read-only
   * preview — the UI confirms before persisting.
   */
  async materialPlanFromBim(projectKey: string): Promise<{ source: string; materials: Array<{ element: string; label: string; unit: string; bimQuantity: number; suggestedCategory: string }> }> {
    const bim = await this.records.findOne({
      where: { projectBusinessKey: projectKey, recordType: 'bim-model', isCurrent: true },
      order: { createdAt: 'DESC' },
    });
    if (!bim) throw new NotFoundException(`No BIM model for ${projectKey}. Upload an IFC model first.`);
    const derived = deriveQuantitiesFromBim((bim.details?.counts ?? {}) as BimCounts);
    return {
      source: `bim-model:${bim.refNumber}`,
      materials: derived.map((d) => ({
        element: d.element,
        label: d.label,
        unit: d.unit,
        bimQuantity: d.quantity,
        suggestedCategory: categoryForElement(d.element),
      })),
    };
  }

  /** Long-lead exposure: packages flagged long-lead, sorted by required date. */
  async longLeadRegister(projectKey: string): Promise<ProcurementPackage[]> {
    const all = await this.list(projectKey);
    return all.filter((p) => p.longLead).sort((a, b) => (a.requiredOnSiteDate ?? '9999').localeCompare(b.requiredOnSiteDate ?? '9999'));
  }
}

/** Map a classified element to a procurement trade category. */
function categoryForElement(element: string): string {
  const m: Record<string, string> = {
    substructure: 'concrete', frame: 'structural-steel', upper_floors: 'concrete', roof: 'roofing',
    external_walls: 'facade', windows_external_doors: 'glazing', internal_walls_partitions: 'drywall',
    internal_doors: 'joinery', wall_finishes: 'finishes', floor_finishes: 'finishes', ceiling_finishes: 'finishes',
    services_mechanical: 'MEP-mechanical', services_electrical: 'MEP-electrical', services_protective: 'MEP-fire',
    external_works: 'civils', drainage: 'civils', sanitary: 'MEP-plumbing',
  };
  return m[element] ?? 'general';
}
