import { BadRequestException, Injectable } from '@nestjs/common';

import {
  CLASSIFICATION_FRAMEWORK_VERSION,
  ClassificationStandard,
  ELEMENT_LABELS_AR,
  ELEMENT_LIBRARY,
  lookupElement,
} from './cost-classification';
import { PROJECT_TYPE_ASSUMPTIONS, resolveLocationFactor } from '../feasibility/assumption-library';

/**
 * CostEstimationService — the deterministic cost engine behind Quantity Survey
 * Intelligence (Mr. Ayham, 2026-06-12). Produces a CLASSIFIED elemental cost
 * estimate: the all-in build rate (Sigma feasibility benchmark, location-
 * adjusted) is distributed across the Global Cost Classification Framework
 * elements by their cost-planning weighting, each line carrying its standard
 * code (NRM/UniFormat/MasterFormat/CESMM). Pure maths — no AI, no priced
 * external database. Supports the early stages: conceptual / budget / cost-plan.
 */

export interface EstimateElement {
  element: string;
  label: string;
  labelAr: string;
  code: string;
  standard: ClassificationStandard;
  unit: string;
  quantity: number | null;
  rate: number | null;
  amount: number;
  sharePct: number;
  source: string;
}

export interface ElementalEstimate {
  standard: ClassificationStandard;
  method: string;
  areaSqm: number | null;
  ratePerSqm: number | null;
  totalAmount: number;
  currency: string;
  elements: EstimateElement[];
  benchmark: {
    libraryVersion: string;
    classificationVersion: string;
    projectType: string;
    baseRatePerSqm: number;
    locationFactor: number;
    valueEngineering: Array<{ element: string; sharePct: number; note: string }>;
  };
  confidence: number;
}

interface EstimateInput {
  projectType: string;
  areaSqm: number;
  standard?: ClassificationStandard;
  currency?: string;
  city?: string | null;
  country?: string | null;
  /** Stage tunes contingency/precision: conceptual is coarser than cost-plan. */
  stage?: string;
}

@Injectable()
export class CostEstimationService {
  /**
   * Build a classified elemental estimate from gross floor area × the
   * location-adjusted benchmark build rate, distributed by element cost share.
   */
  estimate(input: EstimateInput): ElementalEstimate {
    const assumptions = PROJECT_TYPE_ASSUMPTIONS[input.projectType];
    if (!assumptions) {
      throw new BadRequestException(
        `Unknown projectType "${input.projectType}". Known: ${Object.keys(PROJECT_TYPE_ASSUMPTIONS).join(', ')}`,
      );
    }
    if (!(input.areaSqm > 0)) throw new BadRequestException('areaSqm must be a positive number');

    const standard = input.standard ?? 'NRM';
    const currency = input.currency?.trim() || 'AED';
    const location = resolveLocationFactor(input.city, input.country);
    // The all-in construction rate per m² BUA (excludes land/soft costs — those
    // are the feasibility CAPEX split, not the QS build cost).
    const baseRate = assumptions.costPerSqmBua;
    if (!(baseRate > 0)) {
      throw new BadRequestException(
        `Project type "${input.projectType}" is CAPEX-driven (no per-m² build rate). Use a building project type.`,
      );
    }
    const ratePerSqm = Math.round(baseRate * location.costFactor * 100) / 100;
    const buildCost = ratePerSqm * input.areaSqm;

    // Normalize element shares (the library shares sum ≈ 1 but renormalize to
    // be exact, then distribute the build cost deterministically).
    const shareSum = ELEMENT_LIBRARY.filter((e) => e.element !== 'other').reduce((s, e) => s + e.costShare, 0);
    const elements: EstimateElement[] = ELEMENT_LIBRARY
      .filter((e) => e.element !== 'other' && e.costShare > 0)
      .map((e) => {
        const sharePct = e.costShare / shareSum;
        const amount = round2(buildCost * sharePct);
        const quantity = ['m2', 'm'].includes(e.unit) ? round2(input.areaSqm * areaFactor(e.element)) : null;
        const rate = quantity && quantity > 0 ? round2(amount / quantity) : null;
        return {
          element: e.element,
          label: e.label,
          labelAr: ELEMENT_LABELS_AR[e.element],
          code: e.codes[standard],
          standard,
          unit: e.unit,
          quantity,
          rate,
          amount,
          sharePct: round4(sharePct),
          source: 'classified-area-benchmark',
        };
      });

    const total = round2(elements.reduce((s, e) => s + e.amount, 0));

    // Value engineering: flag the elements carrying the largest cost share as
    // the highest-leverage VE targets (deterministic, named).
    const valueEngineering = [...elements]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3)
      .map((e) => ({
        element: e.label,
        sharePct: round4(e.sharePct),
        note: `${(e.sharePct * 100).toFixed(1)}% of build cost — highest-leverage value-engineering target.`,
      }));

    // Stage-driven confidence: conceptual coarser, cost-plan tighter.
    const confidence = input.stage === 'cost-plan' ? 0.78 : input.stage === 'budget' ? 0.72 : 0.65;

    return {
      standard,
      method: 'area-benchmark',
      areaSqm: input.areaSqm,
      ratePerSqm,
      totalAmount: total,
      currency,
      elements,
      benchmark: {
        libraryVersion: 'sigma-feasibility-v1',
        classificationVersion: CLASSIFICATION_FRAMEWORK_VERSION,
        projectType: input.projectType,
        baseRatePerSqm: baseRate,
        locationFactor: location.costFactor,
        valueEngineering,
      },
      confidence,
    };
  }

  /**
   * Build a classified estimate directly from extracted element quantities
   * (the BIM → Quantity → Cost path): each {element, quantity} is priced at
   * the benchmark elemental rate and tagged with its standard code.
   */
  estimateFromQuantities(input: {
    quantities: Array<{ element: string; quantity: number }>;
    projectType: string;
    standard?: ClassificationStandard;
    currency?: string;
    areaSqm?: number;
    city?: string | null;
    country?: string | null;
  }): ElementalEstimate {
    const assumptions = PROJECT_TYPE_ASSUMPTIONS[input.projectType];
    if (!assumptions || !(assumptions.costPerSqmBua > 0)) {
      throw new BadRequestException(`projectType "${input.projectType}" has no per-m² build rate.`);
    }
    const standard = input.standard ?? 'NRM';
    const currency = input.currency?.trim() || 'AED';
    const location = resolveLocationFactor(input.city, input.country);
    const ratePerSqm = assumptions.costPerSqmBua * location.costFactor;

    const elements: EstimateElement[] = input.quantities.map((q) => {
      const def = lookupElement(q.element as never) ?? lookupElement('other' as never)!;
      // Elemental rate = base rate × element share / its area factor (derives a
      // per-unit rate consistent with the area-benchmark path).
      const af = areaFactor(def.element);
      const rate = round2((ratePerSqm * def.costShare) / Math.max(af, 0.01));
      const amount = round2(rate * q.quantity);
      return {
        element: def.element,
        label: def.label,
        labelAr: ELEMENT_LABELS_AR[def.element],
        code: def.codes[standard],
        standard,
        unit: def.unit,
        quantity: round2(q.quantity),
        rate,
        amount,
        sharePct: 0,
        source: 'classified-bim-quantities',
      };
    });
    const total = round2(elements.reduce((s, e) => s + e.amount, 0));
    for (const e of elements) e.sharePct = total > 0 ? round4(e.amount / total) : 0;

    return {
      standard,
      method: 'bim-quantities',
      areaSqm: input.areaSqm ?? null,
      ratePerSqm: round2(ratePerSqm),
      totalAmount: total,
      currency,
      elements,
      benchmark: {
        libraryVersion: 'sigma-feasibility-v1',
        classificationVersion: CLASSIFICATION_FRAMEWORK_VERSION,
        projectType: input.projectType,
        baseRatePerSqm: assumptions.costPerSqmBua,
        locationFactor: location.costFactor,
        valueEngineering: [...elements]
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 3)
          .map((e) => ({ element: e.label, sharePct: e.sharePct, note: `${(e.sharePct * 100).toFixed(1)}% of cost.` })),
      },
      confidence: 0.7,
    };
  }
}

/**
 * Per-element quantity ≈ area × factor (gross-area multipliers a QS uses for
 * order-of-magnitude takeoff: e.g. external walls ≈ 0.6×GFA, finishes ≈ 2×GFA
 * for wall+floor+ceiling, services run with GFA). Deterministic, documented.
 */
function areaFactor(element: string): number {
  const f: Record<string, number> = {
    substructure: 0.5, frame: 1, upper_floors: 0.9, roof: 0.45, external_walls: 0.6,
    internal_walls_partitions: 0.8, wall_finishes: 1.6, floor_finishes: 0.95, ceiling_finishes: 0.9,
    services_mechanical: 1, services_electrical: 1, services_protective: 1, external_works: 0.4, drainage: 0.2,
  };
  return f[element] ?? 1;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
