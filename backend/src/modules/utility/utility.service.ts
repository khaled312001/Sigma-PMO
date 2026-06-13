import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UtilityConnection } from '../canonical/entities/utility-connection.entity';

/** Input to create a utility connection (createdBy is stamped by the controller). */
export interface CreateConnectionInput {
  projectKey: string;
  title: string;
  /** power | water | telecom | gas | sewerage | district_cooling. */
  utilityType: string;
  /** not_started | applied | in_progress | testing | energized | connected. */
  status?: string;
  applicationDate?: string | null;
  forecastConnectionDate?: string | null;
  requiredByDate?: string | null;
  details?: Record<string, unknown> | null;
  createdBy?: string | null;
}

/** Patch to a connection (only the mutable readiness fields). */
export interface UpdateConnectionInput {
  title?: string;
  utilityType?: string;
  status?: string;
  applicationDate?: string | null;
  forecastConnectionDate?: string | null;
  requiredByDate?: string | null;
  details?: Record<string, unknown> | null;
}

const UTILITY_TYPES = ['power', 'water', 'telecom', 'gas', 'sewerage', 'district_cooling'];
const UTILITY_STATUSES = ['not_started', 'applied', 'in_progress', 'testing', 'energized', 'connected'];

/**
 * UtilityService — the utility-connection store under Utility Governance
 * (Mr. Ayham, 2026-06-13 17-stage lifecycle scope). Plain CRUD over the
 * UtilityConnection entity (type, status, application/forecast/required-by dates)
 * with a UTL-### business key per project. No readiness mathematics lives here —
 * that is UtilityGovernanceService; this file only persists state. Append-only by
 * (businessKey, isCurrent): an update supersedes the prior current row with an
 * incremented version, preserving the change history (same discipline as every
 * canonical versioned entity).
 */
@Injectable()
export class UtilityService {
  private readonly logger = new Logger(UtilityService.name);

  constructor(
    @InjectRepository(UtilityConnection) private readonly connections: Repository<UtilityConnection>,
  ) {}

  /** All current connections for a project (newest first). */
  list(projectKey: string): Promise<UtilityConnection[]> {
    if (!projectKey?.trim()) throw new BadRequestException('projectKey is required');
    return this.connections.find({
      where: { projectBusinessKey: projectKey, isCurrent: true },
      order: { createdAt: 'DESC' },
    });
  }

  /** A single current connection by id. */
  async get(id: string): Promise<UtilityConnection> {
    const row = await this.connections.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Utility connection "${id}" not found`);
    return row;
  }

  /** Create a connection, assigning the next UTL-### business key for the project. */
  async createConnection(input: CreateConnectionInput): Promise<UtilityConnection> {
    if (!input?.projectKey?.trim()) throw new BadRequestException('projectKey is required');
    if (!input.title?.trim()) throw new BadRequestException('title is required');
    if (!UTILITY_TYPES.includes(input.utilityType)) {
      throw new BadRequestException(`utilityType must be one of: ${UTILITY_TYPES.join(', ')}`);
    }
    const status = input.status ?? 'not_started';
    if (!UTILITY_STATUSES.includes(status)) {
      throw new BadRequestException(`status must be one of: ${UTILITY_STATUSES.join(', ')}`);
    }

    // Count by current rows so superseded versions do not inflate the sequence.
    const count = await this.connections.count({
      where: { projectBusinessKey: input.projectKey, isCurrent: true },
    });
    const businessKey = `UTL-${String(count + 1).padStart(3, '0')}`;

    const saved = await this.connections.save(this.connections.create({
      projectBusinessKey: input.projectKey,
      businessKey,
      title: input.title.trim(),
      utilityType: input.utilityType,
      status,
      applicationDate: input.applicationDate ?? null,
      forecastConnectionDate: input.forecastConnectionDate ?? null,
      requiredByDate: input.requiredByDate ?? null,
      details: input.details ?? null,
      version: 1,
      isCurrent: true,
      createdBy: input.createdBy ?? null,
    }));
    this.logger.log(`Created utility connection ${businessKey} (${saved.utilityType}, ${saved.status}) for ${input.projectKey}.`);
    return saved;
  }

  /**
   * Update a connection's readiness fields. Append-only: supersedes the prior
   * current row (isCurrent=false) and inserts a new version that carries the same
   * business key, so the full status/date history survives.
   */
  async updateConnection(id: string, patch: UpdateConnectionInput): Promise<UtilityConnection> {
    const prior = await this.get(id);
    if (patch.utilityType !== undefined && !UTILITY_TYPES.includes(patch.utilityType)) {
      throw new BadRequestException(`utilityType must be one of: ${UTILITY_TYPES.join(', ')}`);
    }
    if (patch.status !== undefined && !UTILITY_STATUSES.includes(patch.status)) {
      throw new BadRequestException(`status must be one of: ${UTILITY_STATUSES.join(', ')}`);
    }

    prior.isCurrent = false;
    await this.connections.save(prior);

    const next = await this.connections.save(this.connections.create({
      projectBusinessKey: prior.projectBusinessKey,
      businessKey: prior.businessKey,
      title: patch.title?.trim() ?? prior.title,
      utilityType: patch.utilityType ?? prior.utilityType,
      status: patch.status ?? prior.status,
      applicationDate: patch.applicationDate !== undefined ? patch.applicationDate : prior.applicationDate,
      forecastConnectionDate: patch.forecastConnectionDate !== undefined ? patch.forecastConnectionDate : prior.forecastConnectionDate,
      requiredByDate: patch.requiredByDate !== undefined ? patch.requiredByDate : prior.requiredByDate,
      details: patch.details !== undefined ? patch.details : prior.details,
      version: prior.version + 1,
      isCurrent: true,
      createdBy: prior.createdBy,
    }));
    this.logger.log(`Updated utility connection ${prior.businessKey} → v${next.version} for ${prior.projectBusinessKey}.`);
    return next;
  }
}
