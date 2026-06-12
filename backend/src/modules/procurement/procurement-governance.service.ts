import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ProcurementPackage } from '../canonical/entities';
import { VendorIntelligenceService } from './vendor-intelligence.service';

export interface Bid {
  vendorBusinessKey: string;
  vendorName?: string;
  price: number;
  /** 0–100 technical score (compliance, quality, methodology). */
  technical: number;
  deliveryDays?: number;
}

/**
 * ProcurementGovernanceService — RFQ / bid evaluation and award recommendation
 * (Mr. Ayham's Procurement Governance, 2026-06-12). Combines a commercial
 * score (price, normalized) with the technical score and the vendor's
 * intelligence (performance, risk) into one weighted award score. Deterministic
 * and fully explainable; also surfaces a procurement cost trend across packages.
 */
@Injectable()
export class ProcurementGovernanceService {
  // Award weighting (sums to 1): commercial 45, technical 35, vendor 20.
  private readonly W_COMMERCIAL = 0.45;
  private readonly W_TECHNICAL = 0.35;
  private readonly W_VENDOR = 0.2;

  constructor(
    @InjectRepository(ProcurementPackage) private readonly packages: Repository<ProcurementPackage>,
    private readonly vendors: VendorIntelligenceService,
  ) {}

  /**
   * Evaluate bids for a package and recommend an award. Commercial score =
   * lowest price gets 100, others scaled inversely. Vendor score = performance
   * − risk/2 (from the registry when the vendor is known).
   */
  async evaluate(input: { packageId?: string; bids: Bid[] }): Promise<{
    rows: Array<{ vendorBusinessKey: string; vendorName: string | null; price: number; commercialScore: number; technicalScore: number; vendorScore: number; awardScore: number; rank: number }>;
    recommendation: { vendorBusinessKey: string; awardScore: number; rationale: string } | null;
    weights: { commercial: number; technical: number; vendor: number };
  }> {
    const bids = input.bids ?? [];
    if (bids.length === 0) throw new BadRequestException('At least one bid is required.');
    const minPrice = Math.min(...bids.map((b) => b.price).filter((p) => p > 0));

    const rows = await Promise.all(bids.map(async (b) => {
      const commercialScore = b.price > 0 ? round(100 * (minPrice / b.price)) : 0;
      const technicalScore = clamp100(b.technical);
      const vendor = await this.vendors.getByBusinessKey(b.vendorBusinessKey);
      const vendorScore = vendor
        ? round(Math.max(0, vendor.performanceScore - vendor.riskScore / 2))
        : 50; // neutral when vendor not in the registry
      const awardScore = round(
        this.W_COMMERCIAL * commercialScore + this.W_TECHNICAL * technicalScore + this.W_VENDOR * vendorScore,
      );
      return {
        vendorBusinessKey: b.vendorBusinessKey,
        vendorName: b.vendorName ?? vendor?.name ?? null,
        price: b.price,
        commercialScore,
        technicalScore,
        vendorScore,
        awardScore,
        rank: 0,
      };
    }));
    rows.sort((a, b) => b.awardScore - a.awardScore);
    rows.forEach((r, i) => { r.rank = i + 1; });

    const winner = rows[0] ?? null;
    const recommendation = winner
      ? {
          vendorBusinessKey: winner.vendorBusinessKey,
          awardScore: winner.awardScore,
          rationale:
            `Recommend ${winner.vendorName ?? winner.vendorBusinessKey}: highest weighted award score ${winner.awardScore} ` +
            `(commercial ${winner.commercialScore}, technical ${winner.technicalScore}, vendor ${winner.vendorScore}; ` +
            `weights ${this.W_COMMERCIAL}/${this.W_TECHNICAL}/${this.W_VENDOR}).`,
        }
      : null;

    return { rows, recommendation, weights: { commercial: this.W_COMMERCIAL, technical: this.W_TECHNICAL, vendor: this.W_VENDOR } };
  }

  /**
   * Persist an evaluation + award onto the package (the governance trail), and
   * move it to 'awarded'.
   */
  async award(packageId: string, vendorBusinessKey: string, awardedCost: number, evaluation: unknown): Promise<ProcurementPackage> {
    const p = await this.packages.findOne({ where: { id: packageId } });
    if (!p) throw new BadRequestException(`Package ${packageId} not found`);
    p.awardedVendorBusinessKey = vendorBusinessKey;
    p.awardedCost = String(awardedCost);
    p.status = 'awarded';
    p.details = { ...(p.details ?? {}), evaluation, awardedAt: 'recorded' };
    return this.packages.save(p);
  }

  /**
   * Procurement cost intelligence: trend of awarded vs estimated cost across
   * the project's packages, with an indicative inflation/variance signal.
   */
  async costTrend(projectKey: string): Promise<{
    packages: number; totalEstimated: number; totalAwarded: number; awardedVsEstimatedPct: number | null;
    rows: Array<{ businessKey: string; title: string; estimated: number | null; awarded: number | null; variancePct: number | null }>;
  }> {
    const all = await this.packages.find({ where: { projectBusinessKey: projectKey, isCurrent: true } });
    let totalEst = 0, totalAwd = 0;
    const rows = all.map((p) => {
      const est = p.estimatedCost !== null ? Number(p.estimatedCost) : null;
      const awd = p.awardedCost !== null ? Number(p.awardedCost) : null;
      if (est) totalEst += est;
      if (awd) totalAwd += awd;
      const variancePct = est && awd && est > 0 ? round4((awd - est) / est) : null;
      return { businessKey: p.businessKey, title: p.title, estimated: est, awarded: awd, variancePct };
    });
    return {
      packages: all.length,
      totalEstimated: round2(totalEst),
      totalAwarded: round2(totalAwd),
      awardedVsEstimatedPct: totalEst > 0 ? round4((totalAwd - totalEst) / totalEst) : null,
      rows,
    };
  }
}

const round = (n: number): number => Math.round(Math.max(0, Math.min(100, n)) * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const clamp100 = (n: number): number => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
