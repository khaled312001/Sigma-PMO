import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Vendor } from '../canonical/entities';

/** The inputs a vendor's deterministic intelligence scores are derived from. */
export interface VendorInputs {
  yearsActive?: number;
  completedProjects?: number;
  financialStanding?: 'strong' | 'adequate' | 'weak';
  certifications?: string[];
  onTimeDeliveryRate?: number; // 0..1
  defectRate?: number; // 0..1
  disputes?: number;
  singleSourceDependence?: boolean;
}

export interface VendorScores {
  qualificationScore: number;
  evaluationScore: number;
  performanceScore: number;
  riskScore: number;
  status: 'qualified' | 'provisional' | 'disqualified';
  basis: Record<string, string>;
}

/**
 * VendorIntelligenceService — the procurement vendor registry + deterministic
 * intelligence scoring (Mr. Ayham's Vendor Intelligence, 2026-06-12).
 * Qualification, evaluation, performance and risk scores are computed from
 * named inputs with explicit weightings — no AI, fully explainable.
 */
@Injectable()
export class VendorIntelligenceService {
  constructor(@InjectRepository(Vendor) private readonly vendors: Repository<Vendor>) {}

  /** Pure deterministic scoring (exposed for tests + re-scoring). */
  score(inp: VendorInputs): VendorScores {
    const years = clampNum(inp.yearsActive, 0, 50);
    const projects = clampNum(inp.completedProjects, 0, 500);
    const finance = inp.financialStanding ?? 'adequate';
    const certs = inp.certifications?.length ?? 0;
    const otd = clamp01(inp.onTimeDeliveryRate ?? 0.85);
    const defect = clamp01(inp.defectRate ?? 0.05);
    const disputes = clampNum(inp.disputes, 0, 50);

    // Qualification (0–100): track record + finance + certifications.
    const financePts = finance === 'strong' ? 30 : finance === 'adequate' ? 18 : 6;
    const qualification = round(
      Math.min(35, years * 2.2) + Math.min(25, projects * 0.8) + financePts + Math.min(10, certs * 3.3),
    );

    // Evaluation (0–100): qualification blended with delivery + quality signals.
    const evaluation = round(0.5 * qualification + 30 * otd + 20 * (1 - defect));

    // Performance (0–100): on-time × quality, penalised by disputes.
    const performance = round(Math.max(0, 60 * otd + 40 * (1 - defect) - disputes * 3));

    // Risk (0–100, higher = riskier): poor finance + late + defects + disputes
    // + single-source dependence.
    const risk = round(
      (finance === 'weak' ? 30 : finance === 'adequate' ? 12 : 4) +
      35 * (1 - otd) + 20 * defect + Math.min(15, disputes * 3) + (inp.singleSourceDependence ? 10 : 0),
    );

    const status: VendorScores['status'] =
      qualification >= 55 && risk < 50 ? 'qualified' : risk >= 70 || qualification < 30 ? 'disqualified' : 'provisional';

    return {
      qualificationScore: qualification,
      evaluationScore: evaluation,
      performanceScore: performance,
      riskScore: risk,
      status,
      basis: {
        qualification: 'min(35, years×2.2) + min(25, projects×0.8) + finance(30/18/6) + min(10, certs×3.3)',
        evaluation: '0.5×qualification + 30×onTimeRate + 20×(1−defectRate)',
        performance: 'max(0, 60×onTimeRate + 40×(1−defectRate) − disputes×3)',
        risk: 'finance + 35×(1−onTime) + 20×defect + min(15, disputes×3) + 10 if single-source',
      },
    };
  }

  async create(input: { name: string; category: string; country?: string | null; inputs?: VendorInputs; createdBy?: string | null }): Promise<Vendor> {
    if (!input.name?.trim()) throw new BadRequestException('name is required');
    if (!input.category?.trim()) throw new BadRequestException('category is required');
    const count = await this.vendors.count();
    const businessKey = `VND-${String(count + 1).padStart(4, '0')}`;
    const scores = this.score(input.inputs ?? {});
    return this.vendors.save(this.vendors.create({
      businessKey,
      name: input.name.trim(),
      category: input.category.trim(),
      country: input.country ?? null,
      qualificationScore: scores.qualificationScore,
      evaluationScore: scores.evaluationScore,
      performanceScore: scores.performanceScore,
      riskScore: scores.riskScore,
      status: scores.status,
      details: { inputs: input.inputs ?? {}, basis: scores.basis },
      version: 1,
      isCurrent: true,
      createdBy: input.createdBy ?? null,
    }));
  }

  async rescore(id: string, inputs: VendorInputs): Promise<Vendor> {
    const v = await this.vendors.findOne({ where: { id } });
    if (!v) throw new NotFoundException(`Vendor ${id} not found`);
    const scores = this.score(inputs);
    v.qualificationScore = scores.qualificationScore;
    v.evaluationScore = scores.evaluationScore;
    v.performanceScore = scores.performanceScore;
    v.riskScore = scores.riskScore;
    v.status = scores.status;
    v.details = { inputs, basis: scores.basis };
    return this.vendors.save(v);
  }

  list(category?: string): Promise<Vendor[]> {
    const where: Record<string, unknown> = { isCurrent: true };
    if (category) where.category = category;
    return this.vendors.find({ where, order: { qualificationScore: 'DESC' } });
  }

  async getByBusinessKey(businessKey: string): Promise<Vendor | null> {
    return this.vendors.findOne({ where: { businessKey, isCurrent: true } });
  }
}

const round = (n: number): number => Math.round(Math.max(0, Math.min(100, n)) * 10) / 10;
const clamp01 = (n: number): number => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const clampNum = (n: number | undefined, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Number.isFinite(n as number) ? (n as number) : 0));
