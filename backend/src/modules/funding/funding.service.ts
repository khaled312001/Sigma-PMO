import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FundingFacility } from '../canonical/entities';
import { ProjectOwnershipService } from '../canonical/project-ownership.service';

/** Input to create a funding facility (createdBy is stamped by the controller). */
export interface CreateFacilityInput {
  projectKey: string;
  name: string;
  lenderName?: string | null;
  /** senior-debt | mezzanine | equity | grant | revolving. */
  facilityType: string;
  amount: number;
  currency?: string;
  interestRatePct?: number | null;
  tenorYears?: number | null;
  drawnAmount?: number;
  repaidAmount?: number;
  dscrCovenant?: number | null;
  currentDscr?: number | null;
  maturityDate?: string | null;
  status?: string;
  /** { covenants:[{name,metric,threshold,operator,current}], schedule:[] }. */
  details?: Record<string, unknown> | null;
  createdBy?: string | null;
}

/** Patch to a facility (only the mutable monitoring fields). */
export interface UpdateFacilityInput {
  name?: string;
  lenderName?: string | null;
  facilityType?: string;
  amount?: number;
  currency?: string;
  interestRatePct?: number | null;
  tenorYears?: number | null;
  drawnAmount?: number;
  repaidAmount?: number;
  dscrCovenant?: number | null;
  currentDscr?: number | null;
  maturityDate?: string | null;
  status?: string;
  details?: Record<string, unknown> | null;
}

const FACILITY_TYPES = ['senior-debt', 'mezzanine', 'equity', 'grant', 'revolving'];
const FACILITY_STATUSES = ['active', 'breached', 'refinanced', 'closed'];

/**
 * FundingService — the funding-facility store under Funding Governance
 * (Mr. Ayham, 2026-06-12 active scope). Plain CRUD over the FundingFacility
 * entity (drawdown, DSCR, covenants, maturity) with an FAC-### business key per
 * project. No financial mathematics lives here — that is FundingGovernance
 * Service; this file only persists state. Append-only by (businessKey,
 * isCurrent): an update supersedes the prior current row with an incremented
 * version, preserving the change history (same discipline as every canonical
 * versioned entity).
 */
@Injectable()
export class FundingService {
  private readonly logger = new Logger(FundingService.name);

  constructor(
    @InjectRepository(FundingFacility) private readonly facilities: Repository<FundingFacility>,
    private readonly ownership?: ProjectOwnershipService,
  ) {}

  /** All current facilities for a project (newest first). */
  list(projectKey: string): Promise<FundingFacility[]> {
    if (!projectKey?.trim()) throw new BadRequestException('projectKey is required');
    return this.facilities.find({
      where: { projectBusinessKey: projectKey, isCurrent: true },
      order: { createdAt: 'DESC' },
    });
  }

  /** A single current facility by id. */
  async get(id: string): Promise<FundingFacility> {
    const row = await this.facilities.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Funding facility "${id}" not found`);
    await this.ownership?.assertOwns(row.projectBusinessKey); // multi-tenant ownership (covers updateFacility)
    return row;
  }

  /** Create a facility, assigning the next FAC-### business key for the project. */
  async createFacility(input: CreateFacilityInput): Promise<FundingFacility> {
    if (!input?.projectKey?.trim()) throw new BadRequestException('projectKey is required');
    if (!input.name?.trim()) throw new BadRequestException('name is required');
    if (!FACILITY_TYPES.includes(input.facilityType)) {
      throw new BadRequestException(`facilityType must be one of: ${FACILITY_TYPES.join(', ')}`);
    }
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }
    const status = input.status ?? 'active';
    if (!FACILITY_STATUSES.includes(status)) {
      throw new BadRequestException(`status must be one of: ${FACILITY_STATUSES.join(', ')}`);
    }

    // Count by current rows so superseded versions do not inflate the sequence.
    const count = await this.facilities.count({
      where: { projectBusinessKey: input.projectKey, isCurrent: true },
    });
    const businessKey = `FAC-${String(count + 1).padStart(3, '0')}`;

    const saved = await this.facilities.save(this.facilities.create({
      projectBusinessKey: input.projectKey,
      businessKey,
      name: input.name.trim(),
      lenderName: input.lenderName ?? null,
      facilityType: input.facilityType,
      amount: money(input.amount),
      currency: input.currency ?? 'AED',
      interestRatePct: numOrNull(input.interestRatePct),
      tenorYears: intOrNull(input.tenorYears),
      drawnAmount: money(input.drawnAmount ?? 0),
      repaidAmount: money(input.repaidAmount ?? 0),
      dscrCovenant: numOrNull(input.dscrCovenant),
      currentDscr: numOrNull(input.currentDscr),
      maturityDate: input.maturityDate ?? null,
      status,
      details: input.details ?? null,
      version: 1,
      isCurrent: true,
      createdBy: input.createdBy ?? null,
    }));
    this.logger.log(`Created funding facility ${businessKey} (${saved.facilityType}, ${saved.amount} ${saved.currency}) for ${input.projectKey}.`);
    return saved;
  }

  /**
   * Update a facility's monitoring fields. Append-only: supersedes the prior
   * current row (isCurrent=false) and inserts a new version that carries the
   * same id-namespace business key, so the full drawdown/DSCR history survives.
   */
  async updateFacility(id: string, patch: UpdateFacilityInput): Promise<FundingFacility> {
    const prior = await this.get(id);
    if (patch.facilityType !== undefined && !FACILITY_TYPES.includes(patch.facilityType)) {
      throw new BadRequestException(`facilityType must be one of: ${FACILITY_TYPES.join(', ')}`);
    }
    if (patch.status !== undefined && !FACILITY_STATUSES.includes(patch.status)) {
      throw new BadRequestException(`status must be one of: ${FACILITY_STATUSES.join(', ')}`);
    }
    if (patch.amount !== undefined && (!Number.isFinite(patch.amount) || patch.amount <= 0)) {
      throw new BadRequestException('amount must be a positive number');
    }

    prior.isCurrent = false;
    await this.facilities.save(prior);

    const next = await this.facilities.save(this.facilities.create({
      projectBusinessKey: prior.projectBusinessKey,
      businessKey: prior.businessKey,
      name: patch.name?.trim() ?? prior.name,
      lenderName: patch.lenderName !== undefined ? patch.lenderName : prior.lenderName,
      facilityType: patch.facilityType ?? prior.facilityType,
      amount: patch.amount !== undefined ? money(patch.amount) : prior.amount,
      currency: patch.currency ?? prior.currency,
      interestRatePct: patch.interestRatePct !== undefined ? numOrNull(patch.interestRatePct) : prior.interestRatePct,
      tenorYears: patch.tenorYears !== undefined ? intOrNull(patch.tenorYears) : prior.tenorYears,
      drawnAmount: patch.drawnAmount !== undefined ? money(patch.drawnAmount) : prior.drawnAmount,
      repaidAmount: patch.repaidAmount !== undefined ? money(patch.repaidAmount) : prior.repaidAmount,
      dscrCovenant: patch.dscrCovenant !== undefined ? numOrNull(patch.dscrCovenant) : prior.dscrCovenant,
      currentDscr: patch.currentDscr !== undefined ? numOrNull(patch.currentDscr) : prior.currentDscr,
      maturityDate: patch.maturityDate !== undefined ? patch.maturityDate : prior.maturityDate,
      status: patch.status ?? prior.status,
      details: patch.details !== undefined ? patch.details : prior.details,
      version: prior.version + 1,
      isCurrent: true,
      createdBy: prior.createdBy,
    }));
    this.logger.log(`Updated funding facility ${prior.businessKey} → v${next.version} for ${prior.projectBusinessKey}.`);
    return next;
  }
}

const money = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);
const numOrNull = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? n : null);
const intOrNull = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null);
