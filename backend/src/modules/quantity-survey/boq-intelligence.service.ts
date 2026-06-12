import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { BoQ, BoqItem, ProjectRecord } from '../canonical/entities';
import {
  classifyElement,
  ClassificationStandard,
} from './cost-classification';
import { BimCounts, deriveQuantitiesFromBim } from './bim-quantities';
import { CostEstimationService } from './cost-estimation.service';

/** A generated/validated BOQ line. */
export interface BoqLine {
  itemNumber: string;
  description: string;
  element: string;
  code: string;
  standard: ClassificationStandard;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
}

/**
 * BoqIntelligenceService — the tender-stage QS engine: generate a classified
 * BOQ from BIM quantities, validate an existing BOQ, run rate analysis against
 * the benchmark band, and compare tender bids. Deterministic throughout.
 */
@Injectable()
export class BoqIntelligenceService {
  constructor(
    @InjectRepository(BoQ) private readonly boqs: Repository<BoQ>,
    @InjectRepository(BoqItem) private readonly items: Repository<BoqItem>,
    @InjectRepository(ProjectRecord) private readonly records: Repository<ProjectRecord>,
    private readonly estimation: CostEstimationService,
  ) {}

  /**
   * Generate a classified BOQ from the project's latest BIM model
   * (BIM → Quantity → Cost): derive element quantities, price at benchmark
   * elemental rates, classify to the selected standard. Read-only — returns
   * the generated lines without persisting (the QS UI reviews before save).
   */
  async generateFromBim(input: {
    projectKey: string;
    projectType: string;
    standard?: ClassificationStandard;
    currency?: string;
  }): Promise<{ source: string; standard: ClassificationStandard; currency: string; lines: BoqLine[]; total: number }> {
    const standard = input.standard ?? 'NRM';
    const bim = await this.records.findOne({
      where: { projectBusinessKey: input.projectKey, recordType: 'bim-model', isCurrent: true },
      order: { createdAt: 'DESC' },
    });
    if (!bim) {
      throw new NotFoundException(
        `No BIM model found for ${input.projectKey}. Upload an IFC model first (Drawings → BIM Models).`,
      );
    }
    const counts = (bim.details?.counts ?? {}) as BimCounts;
    const derived = deriveQuantitiesFromBim(counts, standard);
    if (derived.length === 0) {
      throw new BadRequestException('The BIM model carries no countable elements to generate a BOQ from.');
    }
    const priced = this.estimation.estimateFromQuantities({
      quantities: derived.map((d) => ({ element: d.element, quantity: d.quantity })),
      projectType: input.projectType,
      standard,
      currency: input.currency,
    });

    const lines: BoqLine[] = priced.elements.map((e, i) => ({
      itemNumber: `${e.code}.${i + 1}`,
      description: e.label,
      element: e.element,
      code: e.code,
      standard,
      unit: e.unit,
      quantity: e.quantity ?? 0,
      rate: e.rate ?? 0,
      amount: e.amount,
    }));
    return { source: `bim-model:${bim.refNumber}`, standard, currency: priced.currency, lines, total: priced.totalAmount };
  }

  /**
   * Validate an existing BOQ document. Deterministic checks: amount = qty×rate
   * per line, non-zero quantities/rates, classification coverage, total
   * reconciliation. Returns issues + a recomputed total.
   */
  async validate(boqBusinessKey: string, standard: ClassificationStandard = 'NRM'): Promise<{
    boqBusinessKey: string;
    lineCount: number;
    declaredTotal: number | null;
    computedTotal: number;
    issues: Array<{ itemNumber: string; type: string; detail: string }>;
    classified: Array<{ itemNumber: string; element: string; code: string }>;
    passed: boolean;
  }> {
    const boq = await this.boqs.findOne({ where: { businessKey: boqBusinessKey, isCurrent: true } });
    if (!boq) throw new NotFoundException(`BOQ "${boqBusinessKey}" not found`);
    const lines = await this.items.find({ where: { boqId: boq.id } });

    const issues: Array<{ itemNumber: string; type: string; detail: string }> = [];
    const classified: Array<{ itemNumber: string; element: string; code: string }> = [];
    let computed = 0;

    for (const l of lines) {
      const qty = Number(l.quantity);
      const rate = Number(l.unitRate);
      const amount = Number(l.amount);
      computed += amount;
      if (!(qty > 0)) issues.push({ itemNumber: l.itemNumber, type: 'zero-quantity', detail: 'Quantity is zero or missing.' });
      if (!(rate > 0)) issues.push({ itemNumber: l.itemNumber, type: 'zero-rate', detail: 'Unit rate is zero or missing.' });
      const expected = Math.round(qty * rate * 100) / 100;
      if (Math.abs(expected - amount) > Math.max(1, amount * 0.001)) {
        issues.push({ itemNumber: l.itemNumber, type: 'amount-mismatch', detail: `qty×rate=${expected} ≠ amount=${amount}.` });
      }
      const cls = classifyElement(l.description, standard);
      classified.push({ itemNumber: l.itemNumber, element: cls.element, code: cls.code });
      if (cls.element === 'other') {
        issues.push({ itemNumber: l.itemNumber, type: 'unclassified', detail: 'Description did not map to a classification element.' });
      }
    }

    const declaredTotal = boq.totalAmount !== null ? Number(boq.totalAmount) : null;
    computed = Math.round(computed * 100) / 100;
    if (declaredTotal !== null && Math.abs(declaredTotal - computed) > Math.max(1, computed * 0.001)) {
      issues.push({ itemNumber: '(total)', type: 'total-mismatch', detail: `Header total ${declaredTotal} ≠ Σ lines ${computed}.` });
    }

    return {
      boqBusinessKey,
      lineCount: lines.length,
      declaredTotal,
      computedTotal: computed,
      issues,
      classified,
      passed: issues.length === 0,
    };
  }

  /**
   * Tender bid comparison + rate analysis. Each bid supplies per-item rates;
   * we compute each bidder's total, rank them, and flag rates that deviate
   * materially from the median (abnormally low/high → commercial risk).
   */
  compareBids(input: {
    items: Array<{ itemNumber: string; description: string; quantity: number }>;
    bids: Array<{ bidder: string; rates: Record<string, number> }>;
  }): {
    ranking: Array<{ bidder: string; total: number; rank: number; outliers: number }>;
    rateAnalysis: Array<{ itemNumber: string; median: number; spreadPct: number; flags: Array<{ bidder: string; rate: number; note: string }> }>;
  } {
    if (!input.items?.length || !input.bids?.length) {
      throw new BadRequestException('items and bids are both required for a comparison.');
    }
    const rateAnalysis = input.items.map((it) => {
      const rates = input.bids.map((b) => ({ bidder: b.bidder, rate: Number(b.rates[it.itemNumber] ?? 0) })).filter((r) => r.rate > 0);
      const sorted = [...rates].map((r) => r.rate).sort((a, b) => a - b);
      const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
      const min = sorted[0] ?? 0;
      const max = sorted[sorted.length - 1] ?? 0;
      const spreadPct = median > 0 ? round4((max - min) / median) : 0;
      const flags = rates
        .filter((r) => median > 0 && (r.rate < median * 0.7 || r.rate > median * 1.4))
        .map((r) => ({
          bidder: r.bidder,
          rate: r.rate,
          note: r.rate < median * 0.7 ? 'abnormally low vs median (under-pricing risk)' : 'abnormally high vs median',
        }));
      return { itemNumber: it.itemNumber, median, spreadPct, flags };
    });

    const totals = input.bids.map((b) => {
      let total = 0;
      let outliers = 0;
      for (const it of input.items) {
        const rate = Number(b.rates[it.itemNumber] ?? 0);
        total += rate * it.quantity;
      }
      for (const ra of rateAnalysis) if (ra.flags.some((f) => f.bidder === b.bidder)) outliers += 1;
      return { bidder: b.bidder, total: round2(total), outliers };
    });
    totals.sort((a, b) => a.total - b.total);
    const ranking = totals.map((t, i) => ({ ...t, rank: i + 1 }));

    return { ranking, rateAnalysis };
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
