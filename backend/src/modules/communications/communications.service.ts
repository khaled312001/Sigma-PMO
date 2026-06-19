import { randomUUID } from 'node:crypto';

import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';

import { currentCompanyId } from '../../common/tenant/tenant-context';
import { AuditLog } from '../audit/audit-log.entity';
import { User } from '../canonical/entities';
import { Communication, CommunicationCategory } from './communication.entity';

export interface CreateCommDto {
  projectKey?: string | null;
  category?: CommunicationCategory;
  subject: string;
  body?: string;
  recipientEmail?: string;
  recipientCompany?: string;
  recipientRole?: string;
  requiresAck?: boolean;
  actionDueDate?: string | null;
  attachments?: Array<{ name: string; bytes?: number }>;
}

/** Hours after which an unopened official communication is flagged. */
const UNREAD_ALERT_HOURS = 24;

@Injectable()
export class CommunicationsService {
  private readonly logger = new Logger(CommunicationsService.name);

  constructor(
    @InjectRepository(Communication) private readonly comms: Repository<Communication>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
  ) {}

  async create(dto: CreateCommDto, caller: User): Promise<Communication> {
    if (!dto.subject?.trim()) throw new BadRequestException('subject is required');
    const now = new Date();
    const comm = await this.comms.save(this.comms.create({
      companyId: caller.companyId ?? currentCompanyId(),
      projectBusinessKey: dto.projectKey?.trim() || null,
      commId: `COM-${randomUUID().slice(0, 8).toUpperCase()}`,
      category: dto.category ?? 'general',
      subject: dto.subject.trim().slice(0, 512),
      body: dto.body?.trim() || null,
      attachments: dto.attachments ?? null,
      senderEmail: caller.email,
      senderRole: caller.role,
      recipientEmail: dto.recipientEmail?.trim() || null,
      recipientCompany: dto.recipientCompany?.trim() || null,
      recipientRole: dto.recipientRole?.trim() || null,
      // Registered = delivered to the Sigma project channel immediately.
      status: 'delivered',
      requiresAck: !!dto.requiresAck,
      actionDueDate: dto.actionDueDate || null,
      sentAt: now,
      deliveredAt: now,
      createdByEmail: caller.email,
    }));
    await this.writeAudit(caller, comm, 'comm.sent', { category: comm.category, recipient: comm.recipientEmail });
    return comm;
  }

  async list(caller: User, projectKey?: string): Promise<Array<Communication & { overdue: boolean; unreadHours: number | null }>> {
    const cid = caller.companyId ?? currentCompanyId();
    const where: Record<string, unknown> = {};
    if (cid) where.companyId = cid;
    if (projectKey) where.projectBusinessKey = projectKey;
    const rows = await this.comms.find({ where, order: { createdAt: 'DESC' }, take: 200 });
    const now = Date.now();
    return rows.map((c) => {
      const unopened = !c.openedAt;
      const ageH = c.sentAt ? (now - new Date(c.sentAt).getTime()) / 3_600_000 : null;
      return Object.assign(c, {
        overdue: unopened && ageH !== null && ageH > UNREAD_ALERT_HOURS,
        unreadHours: unopened && ageH !== null ? Math.round(ageH) : null,
      });
    });
  }

  /** Find unopened communications past the alert window (for escalation). */
  async overdue(caller: User): Promise<Communication[]> {
    const cid = caller.companyId ?? currentCompanyId();
    const cutoff = new Date(Date.now() - UNREAD_ALERT_HOURS * 3_600_000);
    return this.comms.find({
      where: { ...(cid ? { companyId: cid } : {}), openedAt: null as unknown as Date, sentAt: LessThan(cutoff) },
      order: { sentAt: 'ASC' },
      take: 100,
    });
  }

  /**
   * Open inside Sigma — the strong, authenticated evidence of access. Records
   * openedAt + the authenticated opener the FIRST time, and audits it.
   */
  async open(id: string, caller: User): Promise<Communication> {
    const comm = await this.load(id, caller);
    if (!comm.openedAt) {
      comm.openedAt = new Date();
      comm.openedByEmail = caller.email;
      if (comm.status === 'sent' || comm.status === 'delivered') comm.status = 'opened';
      await this.comms.save(comm);
      await this.writeAudit(caller, comm, 'comm.opened', { authenticatedOpen: true });
    }
    return comm;
  }

  async acknowledge(id: string, caller: User): Promise<Communication> {
    const comm = await this.load(id, caller);
    if (!comm.openedAt) { comm.openedAt = new Date(); comm.openedByEmail = caller.email; }
    comm.acknowledgedAt = new Date();
    comm.status = 'acknowledged';
    await this.comms.save(comm);
    await this.writeAudit(caller, comm, 'comm.acknowledged', {});
    return comm;
  }

  async respond(id: string, caller: User, dto: { decision: 'accepted' | 'rejected'; reply?: string }): Promise<Communication> {
    if (!['accepted', 'rejected'].includes(dto.decision)) throw new BadRequestException('decision must be accepted|rejected');
    const comm = await this.load(id, caller);
    comm.respondedAt = new Date();
    comm.responseDecision = dto.decision;
    comm.reply = dto.reply?.trim() || null;
    comm.status = dto.decision;
    await this.comms.save(comm);
    await this.writeAudit(caller, comm, 'comm.responded', { decision: dto.decision });
    return comm;
  }

  async escalate(id: string, caller: User): Promise<Communication> {
    const comm = await this.load(id, caller);
    comm.escalatedAt = new Date();
    comm.escalationLevel = (comm.escalationLevel ?? 0) + 1;
    comm.status = 'escalated';
    await this.comms.save(comm);
    await this.writeAudit(caller, comm, 'comm.escalated', { level: comm.escalationLevel });
    return comm;
  }

  // ── helpers ──
  private async load(id: string, caller: User): Promise<Communication> {
    const comm = await this.comms.findOne({ where: { id } });
    if (!comm) throw new NotFoundException('Communication not found');
    const cid = caller.companyId ?? currentCompanyId();
    if (cid && comm.companyId && comm.companyId !== cid) throw new ForbiddenException('Not your communication');
    return comm;
  }

  private async writeAudit(caller: User, comm: Communication, action: string, meta: Record<string, unknown>): Promise<void> {
    try {
      await this.audit.save(
        this.audit.create({
          companyId: comm.companyId,
          actorUserId: caller.id,
          actorEmail: caller.email,
          actorRole: caller.role,
          action,
          method: 'POST',
          path: `/communications/${comm.id}`,
          statusCode: 200,
          ip: null,
          meta: { commId: comm.commId, subject: comm.subject, status: comm.status, projectKey: comm.projectBusinessKey, ...meta },
        }),
      );
    } catch (err) {
      this.logger.warn(`Comm audit skipped: ${(err as Error).message}`);
    }
  }
}
