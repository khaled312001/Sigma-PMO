import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { OperationalReadinessItem } from '../canonical/entities/operational-readiness-item.entity';

/** Input to create a readiness item (createdBy is stamped by the controller). */
export interface CreateReadinessItemInput {
  projectKey: string;
  title: string;
  /** om_manual | asset_register | training | testing_commissioning | handover | staffing | spares | warranty. */
  category: string;
  /** not_started | in_progress | submitted | approved | complete. */
  status?: string;
  completionPct?: number | null;
  dueDate?: string | null;
  /** { checklist:[{name,done}], evidence:[{label,url}] }. */
  details?: Record<string, unknown> | null;
  createdBy?: string | null;
}

/** Patch to a readiness item (only the mutable tracking fields). */
export interface UpdateReadinessItemInput {
  title?: string;
  category?: string;
  status?: string;
  completionPct?: number | null;
  dueDate?: string | null;
  details?: Record<string, unknown> | null;
}

const CATEGORIES = [
  'om_manual',
  'asset_register',
  'training',
  'testing_commissioning',
  'handover',
  'staffing',
  'spares',
  'warranty',
];
const STATUSES = ['not_started', 'in_progress', 'submitted', 'approved', 'complete'];

/**
 * OperationalReadinessService — the readiness-item store under Operational
 * Readiness Governance (Mr. Ayham, 2026-06-13). Plain CRUD over the
 * OperationalReadinessItem entity (category, status, completion, due date) with
 * an OPR-### business key per project. No readiness mathematics lives here —
 * that is OperationalReadinessGovernanceService; this file only persists state.
 * Append-only by (businessKey, isCurrent): an update supersedes the prior
 * current row with an incremented version, preserving the change history (same
 * discipline as every canonical versioned entity).
 */
@Injectable()
export class OperationalReadinessService {
  private readonly logger = new Logger(OperationalReadinessService.name);

  constructor(
    @InjectRepository(OperationalReadinessItem)
    private readonly items: Repository<OperationalReadinessItem>,
  ) {}

  /** All current readiness items for a project (newest first). */
  list(projectKey: string): Promise<OperationalReadinessItem[]> {
    if (!projectKey?.trim()) throw new BadRequestException('projectKey is required');
    return this.items.find({
      where: { projectBusinessKey: projectKey, isCurrent: true },
      order: { createdAt: 'DESC' },
    });
  }

  /** A single readiness item by id. */
  async get(id: string): Promise<OperationalReadinessItem> {
    const row = await this.items.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Operational readiness item "${id}" not found`);
    return row;
  }

  /** Create an item, assigning the next OPR-### business key for the project. */
  async createItem(input: CreateReadinessItemInput): Promise<OperationalReadinessItem> {
    if (!input?.projectKey?.trim()) throw new BadRequestException('projectKey is required');
    if (!input.title?.trim()) throw new BadRequestException('title is required');
    if (!CATEGORIES.includes(input.category)) {
      throw new BadRequestException(`category must be one of: ${CATEGORIES.join(', ')}`);
    }
    const status = input.status ?? 'not_started';
    if (!STATUSES.includes(status)) {
      throw new BadRequestException(`status must be one of: ${STATUSES.join(', ')}`);
    }
    if (input.completionPct !== undefined && input.completionPct !== null) {
      if (!Number.isFinite(input.completionPct) || input.completionPct < 0 || input.completionPct > 100) {
        throw new BadRequestException('completionPct must be between 0 and 100');
      }
    }

    // Count by current rows so superseded versions do not inflate the sequence.
    const count = await this.items.count({
      where: { projectBusinessKey: input.projectKey, isCurrent: true },
    });
    const businessKey = `OPR-${String(count + 1).padStart(3, '0')}`;

    const saved = await this.items.save(this.items.create({
      projectBusinessKey: input.projectKey,
      businessKey,
      title: input.title.trim(),
      category: input.category,
      status,
      completionPct: pctOrNull(input.completionPct),
      dueDate: input.dueDate ?? null,
      details: input.details ?? null,
      version: 1,
      isCurrent: true,
      createdBy: input.createdBy ?? null,
    }));
    this.logger.log(`Created readiness item ${businessKey} (${saved.category}, ${saved.status}) for ${input.projectKey}.`);
    return saved;
  }

  /**
   * Update an item's tracking fields. Append-only: supersedes the prior current
   * row (isCurrent=false) and inserts a new version carrying the same business
   * key, so the full readiness history survives.
   */
  async updateItem(id: string, patch: UpdateReadinessItemInput): Promise<OperationalReadinessItem> {
    const prior = await this.get(id);
    if (patch.category !== undefined && !CATEGORIES.includes(patch.category)) {
      throw new BadRequestException(`category must be one of: ${CATEGORIES.join(', ')}`);
    }
    if (patch.status !== undefined && !STATUSES.includes(patch.status)) {
      throw new BadRequestException(`status must be one of: ${STATUSES.join(', ')}`);
    }
    if (patch.completionPct !== undefined && patch.completionPct !== null) {
      if (!Number.isFinite(patch.completionPct) || patch.completionPct < 0 || patch.completionPct > 100) {
        throw new BadRequestException('completionPct must be between 0 and 100');
      }
    }

    prior.isCurrent = false;
    await this.items.save(prior);

    const next = await this.items.save(this.items.create({
      projectBusinessKey: prior.projectBusinessKey,
      businessKey: prior.businessKey,
      title: patch.title?.trim() ?? prior.title,
      category: patch.category ?? prior.category,
      status: patch.status ?? prior.status,
      completionPct: patch.completionPct !== undefined ? pctOrNull(patch.completionPct) : prior.completionPct,
      dueDate: patch.dueDate !== undefined ? patch.dueDate : prior.dueDate,
      details: patch.details !== undefined ? patch.details : prior.details,
      version: prior.version + 1,
      isCurrent: true,
      createdBy: prior.createdBy,
    }));
    this.logger.log(`Updated readiness item ${prior.businessKey} → v${next.version} for ${prior.projectBusinessKey}.`);
    return next;
  }
}

const pctOrNull = (n: unknown): number | null =>
  (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null);
