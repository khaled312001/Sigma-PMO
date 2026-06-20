import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { currentCompanyId } from '../../common/tenant/tenant-context';
import { CustodyEvent } from './custody-event.entity';
import { LegalHold } from './legal-hold.entity';

export interface PlaceHoldInput {
  targetTable: string;
  targetId: string;
  reason: string;
  projectBusinessKey?: string | null;
  targetLabel?: string | null;
  matterRef?: string | null;
  placedByEmail?: string | null;
}

export interface CustodyInput {
  targetTable: string;
  targetId: string;
  event: string;
  projectBusinessKey?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  ip?: string | null;
  shaAtEvent?: string | null;
  detail?: Record<string, unknown> | null;
}

/**
 * LegalHoldService — preservation holds + the chain-of-custody ledger
 * (Mr. Ayham acceptance #6/#12). isHeld() is the gate the generic delete path
 * consults to refuse hard-deletion of dispute-linked rows; logCustody() records
 * the document custody trail. Tenant-scoped via the request company context.
 */
@Injectable()
export class LegalHoldService {
  private readonly logger = new Logger(LegalHoldService.name);

  constructor(
    @InjectRepository(LegalHold) private readonly holds: Repository<LegalHold>,
    @InjectRepository(CustodyEvent) private readonly custody: Repository<CustodyEvent>,
  ) {}

  /** True when an active hold exists on (table, id) within the caller's tenant. */
  async isHeld(targetTable: string, targetId: string): Promise<boolean> {
    const hold = await this.activeHoldFor(targetTable, targetId);
    return !!hold;
  }

  async activeHoldFor(targetTable: string, targetId: string): Promise<LegalHold | null> {
    const companyId = currentCompanyId();
    const where: Record<string, unknown> = { targetTable, targetId, status: 'active' };
    if (companyId) where.companyId = companyId;
    return this.holds.findOne({ where });
  }

  async placeHold(input: PlaceHoldInput): Promise<LegalHold> {
    if (!input?.targetTable?.trim() || !input?.targetId?.trim()) throw new BadRequestException('targetTable and targetId are required');
    if (!input.reason?.trim()) throw new BadRequestException('reason is required for a legal hold');
    const existing = await this.activeHoldFor(input.targetTable, input.targetId);
    if (existing) return existing; // idempotent — one active hold per target

    const companyId = currentCompanyId();
    const saved = await this.holds.save(this.holds.create({
      companyId: companyId ?? null,
      projectBusinessKey: input.projectBusinessKey ?? null,
      targetTable: input.targetTable,
      targetId: input.targetId,
      targetLabel: input.targetLabel ?? null,
      reason: input.reason.trim(),
      matterRef: input.matterRef ?? null,
      status: 'active',
      placedByEmail: input.placedByEmail ?? null,
      releasedByEmail: null,
      releasedAt: null,
      releaseReason: null,
    }));
    await this.logCustody({
      targetTable: input.targetTable, targetId: input.targetId, event: 'hold_placed',
      projectBusinessKey: input.projectBusinessKey ?? null, actorEmail: input.placedByEmail ?? null,
      detail: { reason: saved.reason, matterRef: saved.matterRef },
    });
    this.logger.log(`Legal hold placed on ${input.targetTable}/${input.targetId} (${saved.matterRef ?? 'no matter ref'}).`);
    return saved;
  }

  async releaseHold(id: string, byEmail: string | null, reason: string | null): Promise<LegalHold> {
    const hold = await this.holds.findOne({ where: { id } });
    if (!hold) throw new NotFoundException(`Legal hold "${id}" not found`);
    if (hold.status === 'released') return hold;
    hold.status = 'released';
    hold.releasedByEmail = byEmail;
    hold.releasedAt = new Date();
    hold.releaseReason = reason;
    const saved = await this.holds.save(hold);
    await this.logCustody({
      targetTable: hold.targetTable, targetId: hold.targetId, event: 'hold_released',
      projectBusinessKey: hold.projectBusinessKey, actorEmail: byEmail, detail: { reason },
    });
    this.logger.log(`Legal hold released on ${hold.targetTable}/${hold.targetId}.`);
    return saved;
  }

  async listHolds(projectKey?: string): Promise<LegalHold[]> {
    const companyId = currentCompanyId();
    const where: Record<string, unknown> = {};
    if (companyId) where.companyId = companyId;
    if (projectKey) where.projectBusinessKey = projectKey;
    return this.holds.find({ where, order: { createdAt: 'DESC' } });
  }

  /** Append a custody event (best-effort — never throws to the caller). */
  async logCustody(input: CustodyInput): Promise<void> {
    try {
      await this.custody.save(this.custody.create({
        companyId: currentCompanyId() ?? null,
        projectBusinessKey: input.projectBusinessKey ?? null,
        targetTable: input.targetTable,
        targetId: input.targetId,
        event: input.event,
        actorEmail: input.actorEmail ?? null,
        actorRole: input.actorRole ?? null,
        ip: input.ip ?? null,
        shaAtEvent: input.shaAtEvent ?? null,
        detail: input.detail ?? null,
      }));
    } catch (err) {
      this.logger.warn(`Custody log skipped: ${(err as Error).message}`);
    }
  }

  async listCustody(targetTable?: string, targetId?: string, projectKey?: string): Promise<CustodyEvent[]> {
    const companyId = currentCompanyId();
    const where: Record<string, unknown> = {};
    if (companyId) where.companyId = companyId;
    if (targetTable) where.targetTable = targetTable;
    if (targetId) where.targetId = targetId;
    if (projectKey) where.projectBusinessKey = projectKey;
    return this.custody.find({ where, order: { createdAt: 'DESC' }, take: 500 });
  }
}
