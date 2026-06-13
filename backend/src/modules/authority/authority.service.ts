import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuthoritySubmission } from '../canonical/entities/authority-submission.entity';

/** Input to create an authority submission (createdBy is stamped by the controller). */
export interface CreateAuthoritySubmissionInput {
  projectKey: string;
  title: string;
  /** municipality | civil_defense | electricity | water | telecom | environmental | rta | health | other. */
  authority: string;
  submissionType?: string | null;
  status?: string;
  openComments?: number;
  submittedDate?: string | null;
  forecastApprovalDate?: string | null;
  requiredByDate?: string | null;
  /** Schedule Activity businessKeys this approval gates. */
  affectedActivityKeys?: string[] | null;
  details?: Record<string, unknown> | null;
  createdBy?: string | null;
}

/** Patch to a submission (only the mutable tracking fields). */
export interface UpdateAuthoritySubmissionInput {
  title?: string;
  authority?: string;
  submissionType?: string | null;
  status?: string;
  openComments?: number;
  submittedDate?: string | null;
  forecastApprovalDate?: string | null;
  requiredByDate?: string | null;
  affectedActivityKeys?: string[] | null;
  details?: Record<string, unknown> | null;
}

const AUTHORITIES = [
  'municipality',
  'civil_defense',
  'electricity',
  'water',
  'telecom',
  'environmental',
  'rta',
  'health',
  'other',
];
const STATUSES = ['draft', 'submitted', 'under_review', 'comments', 'approved', 'rejected'];

/**
 * AuthorityService — the authority-submission store under Authority Governance
 * (Mr. Ayham, 2026-06-13 — full 17-stage governance lifecycle). Plain CRUD over
 * the AuthoritySubmission entity (authority, status, comments, required-by /
 * forecast approval dates, affected schedule activities) with an AUTH-### business
 * key per project. No delay/critical-path mathematics lives here — that is
 * AuthorityGovernanceService; this file only persists state. Append-only by
 * (businessKey, isCurrent): an update supersedes the prior current row with an
 * incremented version, preserving the full submission/approval history (same
 * discipline as every canonical versioned entity).
 */
@Injectable()
export class AuthorityService {
  private readonly logger = new Logger(AuthorityService.name);

  constructor(
    @InjectRepository(AuthoritySubmission)
    private readonly submissions: Repository<AuthoritySubmission>,
  ) {}

  /** All current submissions for a project (newest first). */
  list(projectKey: string): Promise<AuthoritySubmission[]> {
    if (!projectKey?.trim()) throw new BadRequestException('projectKey is required');
    return this.submissions.find({
      where: { projectBusinessKey: projectKey, isCurrent: true },
      order: { createdAt: 'DESC' },
    });
  }

  /** A single submission by id. */
  async get(id: string): Promise<AuthoritySubmission> {
    const row = await this.submissions.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Authority submission "${id}" not found`);
    return row;
  }

  /** Create a submission, assigning the next AUTH-### business key for the project. */
  async createSubmission(input: CreateAuthoritySubmissionInput): Promise<AuthoritySubmission> {
    if (!input?.projectKey?.trim()) throw new BadRequestException('projectKey is required');
    if (!input.title?.trim()) throw new BadRequestException('title is required');
    if (!AUTHORITIES.includes(input.authority)) {
      throw new BadRequestException(`authority must be one of: ${AUTHORITIES.join(', ')}`);
    }
    const status = input.status ?? 'submitted';
    if (!STATUSES.includes(status)) {
      throw new BadRequestException(`status must be one of: ${STATUSES.join(', ')}`);
    }
    if (input.openComments !== undefined && (!Number.isFinite(input.openComments) || input.openComments < 0)) {
      throw new BadRequestException('openComments must be a non-negative number');
    }

    // Count by current rows so superseded versions do not inflate the sequence.
    const count = await this.submissions.count({
      where: { projectBusinessKey: input.projectKey, isCurrent: true },
    });
    const businessKey = `AUTH-${String(count + 1).padStart(3, '0')}`;

    const saved = await this.submissions.save(this.submissions.create({
      projectBusinessKey: input.projectKey,
      businessKey,
      title: input.title.trim(),
      authority: input.authority,
      submissionType: input.submissionType ?? null,
      status,
      openComments: intOrZero(input.openComments),
      submittedDate: input.submittedDate ?? null,
      forecastApprovalDate: input.forecastApprovalDate ?? null,
      requiredByDate: input.requiredByDate ?? null,
      affectedActivityKeys: keysOrNull(input.affectedActivityKeys),
      details: input.details ?? null,
      version: 1,
      isCurrent: true,
      createdBy: input.createdBy ?? null,
    }));
    this.logger.log(`Created authority submission ${businessKey} (${saved.authority}, ${saved.status}) for ${input.projectKey}.`);
    return saved;
  }

  /**
   * Update a submission's tracking fields. Append-only: supersedes the prior
   * current row (isCurrent=false) and inserts a new version carrying the same
   * business key, so the full submission/approval history survives.
   */
  async updateSubmission(id: string, patch: UpdateAuthoritySubmissionInput): Promise<AuthoritySubmission> {
    const prior = await this.get(id);
    if (patch.authority !== undefined && !AUTHORITIES.includes(patch.authority)) {
      throw new BadRequestException(`authority must be one of: ${AUTHORITIES.join(', ')}`);
    }
    if (patch.status !== undefined && !STATUSES.includes(patch.status)) {
      throw new BadRequestException(`status must be one of: ${STATUSES.join(', ')}`);
    }
    if (patch.openComments !== undefined && (!Number.isFinite(patch.openComments) || patch.openComments < 0)) {
      throw new BadRequestException('openComments must be a non-negative number');
    }

    prior.isCurrent = false;
    await this.submissions.save(prior);

    const next = await this.submissions.save(this.submissions.create({
      projectBusinessKey: prior.projectBusinessKey,
      businessKey: prior.businessKey,
      title: patch.title?.trim() ?? prior.title,
      authority: patch.authority ?? prior.authority,
      submissionType: patch.submissionType !== undefined ? patch.submissionType : prior.submissionType,
      status: patch.status ?? prior.status,
      openComments: patch.openComments !== undefined ? intOrZero(patch.openComments) : prior.openComments,
      submittedDate: patch.submittedDate !== undefined ? patch.submittedDate : prior.submittedDate,
      forecastApprovalDate: patch.forecastApprovalDate !== undefined ? patch.forecastApprovalDate : prior.forecastApprovalDate,
      requiredByDate: patch.requiredByDate !== undefined ? patch.requiredByDate : prior.requiredByDate,
      affectedActivityKeys: patch.affectedActivityKeys !== undefined ? keysOrNull(patch.affectedActivityKeys) : prior.affectedActivityKeys,
      details: patch.details !== undefined ? patch.details : prior.details,
      version: prior.version + 1,
      isCurrent: true,
      createdBy: prior.createdBy,
    }));
    this.logger.log(`Updated authority submission ${prior.businessKey} → v${next.version} for ${prior.projectBusinessKey}.`);
    return next;
  }
}

const intOrZero = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
const keysOrNull = (v: unknown): string[] | null =>
  Array.isArray(v) ? v.map((x) => String(x)).filter((s) => s.trim().length > 0) : null;
