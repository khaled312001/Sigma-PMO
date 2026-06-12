import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { BoQ, BoqItem } from '../canonical/entities';

/**
 * MeasurementService — the post-contract QS engine: interim valuations,
 * variations, cost forecasting and final-account preparation. Deterministic
 * commercial arithmetic (RICS interim-valuation method); no AI.
 */
@Injectable()
export class MeasurementService {
  constructor(
    @InjectRepository(BoQ) private readonly boqs: Repository<BoQ>,
    @InjectRepository(BoqItem) private readonly items: Repository<BoqItem>,
  ) {}

  /**
   * Interim valuation: gross measured value = Σ(line amount × measured%),
   * less retention, less previously certified = net due this period.
   */
  async interimValuation(input: {
    boqBusinessKey: string;
    measuredPct: Record<string, number>; // itemNumber → 0..1 measured-to-date
    retentionPct?: number;
    previouslyCertified?: number;
  }): Promise<{
    boqBusinessKey: string;
    lines: Array<{ itemNumber: string; amount: number; measuredPct: number; measuredValue: number }>;
    grossValuation: number;
    retention: number;
    previouslyCertified: number;
    netDue: number;
    overMeasured: string[];
  }> {
    const boq = await this.boqs.findOne({ where: { businessKey: input.boqBusinessKey, isCurrent: true } });
    if (!boq) throw new NotFoundException(`BOQ "${input.boqBusinessKey}" not found`);
    const lines = await this.items.find({ where: { boqId: boq.id } });
    const retentionPct = clampPct(input.retentionPct ?? 0.05);

    let gross = 0;
    const overMeasured: string[] = [];
    const out = lines.map((l) => {
      const amount = Number(l.amount);
      let pct = Number(input.measuredPct[l.itemNumber] ?? 0);
      if (pct > 1) { overMeasured.push(l.itemNumber); pct = Math.min(pct, 1); } // cap + flag >100%
      const measuredValue = round2(amount * pct);
      gross += measuredValue;
      return { itemNumber: l.itemNumber, amount, measuredPct: pct, measuredValue };
    });
    gross = round2(gross);
    const retention = round2(gross * retentionPct);
    const prev = round2(input.previouslyCertified ?? 0);
    const netDue = round2(gross - retention - prev);

    return { boqBusinessKey: input.boqBusinessKey, lines: out, grossValuation: gross, retention, previouslyCertified: prev, netDue, overMeasured };
  }

  /**
   * Final account: contract BOQ ± net variations. `variations` are signed
   * amounts (additions positive, omissions negative) with a reason each.
   */
  async finalAccount(input: {
    boqBusinessKey: string;
    variations?: Array<{ ref: string; description: string; amount: number }>;
  }): Promise<{
    boqBusinessKey: string;
    contractTotal: number;
    variations: Array<{ ref: string; description: string; amount: number }>;
    additions: number;
    omissions: number;
    netVariations: number;
    finalAccountTotal: number;
    movementPct: number;
  }> {
    const boq = await this.boqs.findOne({ where: { businessKey: input.boqBusinessKey, isCurrent: true } });
    if (!boq) throw new NotFoundException(`BOQ "${input.boqBusinessKey}" not found`);
    const contractTotal = boq.totalAmount !== null ? Number(boq.totalAmount) : await this.sumLines(boq.id);
    const variations = input.variations ?? [];
    const additions = round2(variations.filter((v) => v.amount > 0).reduce((s, v) => s + v.amount, 0));
    const omissions = round2(variations.filter((v) => v.amount < 0).reduce((s, v) => s + v.amount, 0));
    const net = round2(additions + omissions);
    const finalTotal = round2(contractTotal + net);
    return {
      boqBusinessKey: input.boqBusinessKey,
      contractTotal: round2(contractTotal),
      variations,
      additions,
      omissions,
      netVariations: net,
      finalAccountTotal: finalTotal,
      movementPct: contractTotal > 0 ? round4(net / contractTotal) : 0,
    };
  }

  /** Cost forecast to completion from progress + current spend (cost EAC). */
  forecast(input: { contractTotal: number; certifiedToDate: number; physicalProgressPct: number }): {
    contractTotal: number; certifiedToDate: number; physicalProgressPct: number;
    costPerformanceIndex: number | null; forecastFinalCost: number | null; forecastVariance: number | null; basis: string;
  } {
    const { contractTotal, certifiedToDate } = input;
    const progress = clampPct(input.physicalProgressPct);
    if (!(progress > 0) || !(contractTotal > 0)) {
      return { contractTotal, certifiedToDate, physicalProgressPct: progress, costPerformanceIndex: null, forecastFinalCost: null, forecastVariance: null, basis: 'insufficient data (need progress>0 and contract>0)' };
    }
    const earned = contractTotal * progress;
    const cpi = certifiedToDate > 0 ? round4(earned / certifiedToDate) : null;
    const forecastFinalCost = cpi && cpi > 0 ? round2(contractTotal / cpi) : null;
    const forecastVariance = forecastFinalCost !== null ? round2(forecastFinalCost - contractTotal) : null;
    return {
      contractTotal, certifiedToDate, physicalProgressPct: progress,
      costPerformanceIndex: cpi, forecastFinalCost, forecastVariance,
      basis: 'CPI = earned(contract×progress) / certified; forecast = contract / CPI',
    };
  }

  private async sumLines(boqId: string): Promise<number> {
    const lines = await this.items.find({ where: { boqId } });
    return round2(lines.reduce((s, l) => s + Number(l.amount), 0));
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const clampPct = (n: number): number => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
