import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuthorityMatrixEntry } from '../canonical/entities/authority-matrix-entry.entity';

/** The contractual actions the matrix governs. */
export const AUTHORITY_ACTIONS = [
  'issue_instruction',
  'approve_material',
  'reject_work',
  'sign_daily_report',
  'approve_variation',
  'send_notice',
  'approve_eot',
  'certify_payment',
  'represent_owner',
  'represent_contractor',
] as const;
export type AuthorityAction = (typeof AUTHORITY_ACTIONS)[number];

const PARTIES = ['owner', 'employer', 'contractor', 'consultant', 'engineer', 'subcontractor', 'pmo'];

export interface CreateAuthorityEntryInput {
  projectKey: string;
  party: string;
  personName: string;
  personEmail?: string | null;
  title?: string | null;
  actions: string[];
  monetaryLimit?: string | number | null;
  currency?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  evidenceSourceFileId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}

export interface AuthorityCheckInput {
  projectKey: string;
  action: string;
  senderEmail?: string | null;
  party?: string | null;
  amount?: number | null;
  asOf?: string | null;
}

export interface AuthorityCheckResult {
  projectKey: string;
  action: string;
  authorized: boolean;
  /** authorized | unauthorized | unknown */
  status: 'authorized' | 'unauthorized' | 'unknown';
  basis: string;
  /** The contractual effect note when not authorized. */
  contractualEffect: string | null;
  matchedEntryKey: string | null;
  matchedPerson: string | null;
}

/**
 * AuthorityMatrixService — the Contractual Authority Matrix store + the
 * authorization check (Mr. Ayham acceptance #10). CRUD over AuthorityMatrixEntry
 * (append-only by businessKey/isCurrent) plus check(): given a contractual
 * action, a sender (email/party), an optional amount and an as-of date, it
 * resolves whether the sender is a duly authorized representative and states the
 * contractual effect when they are not. Pure deterministic.
 */
@Injectable()
export class AuthorityMatrixService {
  private readonly logger = new Logger(AuthorityMatrixService.name);

  constructor(
    @InjectRepository(AuthorityMatrixEntry) private readonly entries: Repository<AuthorityMatrixEntry>,
  ) {}

  list(projectKey: string): Promise<AuthorityMatrixEntry[]> {
    if (!projectKey?.trim()) throw new BadRequestException('projectKey is required');
    return this.entries.find({
      where: { projectBusinessKey: projectKey, isCurrent: true },
      order: { createdAt: 'DESC' },
    });
  }

  async get(id: string): Promise<AuthorityMatrixEntry> {
    const row = await this.entries.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Authority matrix entry "${id}" not found`);
    return row;
  }

  actions(): readonly string[] {
    return AUTHORITY_ACTIONS;
  }

  async createEntry(input: CreateAuthorityEntryInput): Promise<AuthorityMatrixEntry> {
    if (!input?.projectKey?.trim()) throw new BadRequestException('projectKey is required');
    if (!input.personName?.trim()) throw new BadRequestException('personName is required');
    if (!PARTIES.includes(input.party)) throw new BadRequestException(`party must be one of: ${PARTIES.join(', ')}`);
    const actions = cleanActions(input.actions);
    if (actions.length === 0) throw new BadRequestException(`actions must include at least one of: ${AUTHORITY_ACTIONS.join(', ')}`);

    const count = await this.entries.count({ where: { projectBusinessKey: input.projectKey, isCurrent: true } });
    const businessKey = `AUTH-${String(count + 1).padStart(3, '0')}`;

    const saved = await this.entries.save(this.entries.create({
      projectBusinessKey: input.projectKey,
      businessKey,
      party: input.party,
      personName: input.personName.trim(),
      personEmail: input.personEmail?.trim().toLowerCase() || null,
      title: input.title ?? null,
      actions,
      monetaryLimit: decOrNull(input.monetaryLimit),
      currency: input.currency ?? null,
      validFrom: input.validFrom ?? null,
      validTo: input.validTo ?? null,
      evidenceSourceFileId: input.evidenceSourceFileId ?? null,
      status: 'active',
      notes: input.notes ?? null,
      version: 1,
      isCurrent: true,
      createdBy: input.createdBy ?? null,
    }));
    this.logger.log(`Created authority entry ${businessKey} (${saved.party}/${saved.personName}) for ${input.projectKey}.`);
    return saved;
  }

  async updateEntry(id: string, patch: Partial<CreateAuthorityEntryInput> & { status?: string }): Promise<AuthorityMatrixEntry> {
    const prior = await this.get(id);
    if (patch.party !== undefined && !PARTIES.includes(patch.party)) throw new BadRequestException(`party must be one of: ${PARTIES.join(', ')}`);
    const actions = patch.actions !== undefined ? cleanActions(patch.actions) : prior.actions;

    prior.isCurrent = false;
    await this.entries.save(prior);

    const next = await this.entries.save(this.entries.create({
      projectBusinessKey: prior.projectBusinessKey,
      businessKey: prior.businessKey,
      party: patch.party ?? prior.party,
      personName: patch.personName?.trim() ?? prior.personName,
      personEmail: patch.personEmail !== undefined ? (patch.personEmail?.trim().toLowerCase() || null) : prior.personEmail,
      title: patch.title !== undefined ? patch.title : prior.title,
      actions,
      monetaryLimit: patch.monetaryLimit !== undefined ? decOrNull(patch.monetaryLimit) : prior.monetaryLimit,
      currency: patch.currency !== undefined ? patch.currency : prior.currency,
      validFrom: patch.validFrom !== undefined ? patch.validFrom : prior.validFrom,
      validTo: patch.validTo !== undefined ? patch.validTo : prior.validTo,
      evidenceSourceFileId: patch.evidenceSourceFileId !== undefined ? patch.evidenceSourceFileId : prior.evidenceSourceFileId,
      status: patch.status ?? prior.status,
      notes: patch.notes !== undefined ? patch.notes : prior.notes,
      version: prior.version + 1,
      isCurrent: true,
      createdBy: prior.createdBy,
    }));
    this.logger.log(`Updated authority entry ${prior.businessKey} → v${next.version} for ${prior.projectBusinessKey}.`);
    return next;
  }

  /**
   * Resolve whether a sender is contractually authorized to perform an action.
   * Deterministic ladder: match by email first, else by party; enforce action
   * membership, validity window, status and any monetary limit.
   */
  async check(input: AuthorityCheckInput): Promise<AuthorityCheckResult> {
    const { projectKey, action } = input;
    if (!projectKey?.trim()) throw new BadRequestException('projectKey is required');
    if (!AUTHORITY_ACTIONS.includes(action as AuthorityAction)) {
      throw new BadRequestException(`action must be one of: ${AUTHORITY_ACTIONS.join(', ')}`);
    }
    const asOf = input.asOf ?? '2026-06-20';
    const all = await this.list(projectKey);

    if (all.length === 0) {
      return {
        projectKey, action, authorized: false, status: 'unknown',
        basis: `No Contractual Authority Matrix is defined for ${projectKey}, so the issuer of this ${labelOf(action)} cannot be validated.`,
        contractualEffect: 'Define the project authority matrix (authorized representatives + their actions) so issuance can be validated; until then authority is UNKNOWN.',
        matchedEntryKey: null, matchedPerson: null,
      };
    }

    const senderEmail = input.senderEmail?.trim().toLowerCase() || null;
    const party = input.party?.trim().toLowerCase() || null;

    const candidates = all.filter((e) => {
      if (e.status !== 'active') return false;
      if (!Array.isArray(e.actions) || !e.actions.includes(action)) return false;
      if (!withinValidity(e, asOf)) return false;
      if (senderEmail) return e.personEmail === senderEmail;
      if (party) return e.party.toLowerCase() === party;
      return false; // need at least one identifier to match
    });

    // Monetary limit (when an amount is supplied).
    const authorized = candidates.find((e) => {
      if (input.amount == null || e.monetaryLimit == null) return true;
      return input.amount <= Number.parseFloat(e.monetaryLimit);
    });

    if (authorized) {
      return {
        projectKey, action, authorized: true, status: 'authorized',
        basis: `${authorized.personName} (${authorized.title ?? authorized.party}, ${authorized.businessKey}) is authorized to ${labelOf(action)}${input.amount != null && authorized.monetaryLimit ? ` up to ${authorized.monetaryLimit} ${authorized.currency ?? ''}`.trimEnd() : ''}.`,
        contractualEffect: null,
        matchedEntryKey: authorized.businessKey, matchedPerson: authorized.personName,
      };
    }

    // There is a matrix, but this sender/action/amount is not covered.
    const overLimit = candidates.length > 0; // matched action+identity but failed amount
    const basis = overLimit
      ? `The issuer is listed but the amount exceeds their monetary authority for ${labelOf(action)}.`
      : `No authorized representative on the ${projectKey} matrix may ${labelOf(action)} as issued by ${senderEmail ?? party ?? 'this sender'}.`;
    return {
      projectKey, action, authorized: false, status: 'unauthorized',
      basis,
      contractualEffect:
        `A ${labelOf(action)} from a person who is not a duly authorized representative may be contractually ineffective / invalid: ` +
        'it should not be relied upon or actioned until ratified by an authorized signatory, and the discrepancy should be recorded in the dispute evidence chain.',
      matchedEntryKey: null, matchedPerson: null,
    };
  }
}

function withinValidity(e: AuthorityMatrixEntry, asOf: string): boolean {
  const d = asOf.slice(0, 10);
  if (e.validFrom && d < e.validFrom) return false;
  if (e.validTo && d > e.validTo) return false;
  return true;
}
function labelOf(action: string): string {
  return action.replace(/_/g, ' ');
}
function cleanActions(actions: unknown): string[] {
  if (!Array.isArray(actions)) return [];
  return actions
    .map((a) => String(a).trim())
    .filter((a) => (AUTHORITY_ACTIONS as readonly string[]).includes(a));
}
const decOrNull = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number.parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n.toFixed(2) : null;
};
