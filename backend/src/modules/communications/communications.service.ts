import { randomUUID } from 'node:crypto';

import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Not, Repository } from 'typeorm';

import { currentCompanyId } from '../../common/tenant/tenant-context';
import { AuditLog } from '../audit/audit-log.entity';
import { User } from '../canonical/entities';
import { NotificationsService } from '../notifications/notifications.service';
import { CommunicationRuleService } from './communication-rule.service';
import { CommunicationRulesConfig } from './communication-rules.config';
import {
  Communication,
  CommunicationCategory,
  CommunicationCriticality,
} from './communication.entity';

export interface CreateCommDto {
  projectKey?: string | null;
  category?: CommunicationCategory;
  subject: string;
  body?: string;
  recipientEmail?: string;
  recipientCompany?: string;
  recipientRole?: string;
  requiresAck?: boolean;
  requiresResponse?: boolean;
  criticality?: CommunicationCriticality;
  channel?: string;
  responsibleRole?: string;
  actionDueDate?: string | null;
  linkedClaimKey?: string | null;
  linkedRecordKey?: string | null;
  attachments?: Array<{ name: string; bytes?: number }>;
}

/** A communication enriched with the live, rules-derived governance flags. */
export type EnrichedCommunication = Communication & {
  overdue: boolean;
  unreadHours: number | null;
  responseOverdue: boolean;
  escalationDue: boolean;
  alertThresholdHours: number;
  policyWarnings?: string[];
};

const CRITICALITIES: CommunicationCriticality[] = ['low', 'normal', 'high', 'critical'];

@Injectable()
export class CommunicationsService {
  private readonly logger = new Logger(CommunicationsService.name);

  constructor(
    @InjectRepository(Communication) private readonly comms: Repository<Communication>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly rules: CommunicationRuleService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateCommDto, caller: User): Promise<EnrichedCommunication> {
    if (!dto.subject?.trim()) throw new BadRequestException('subject is required');
    const companyId = caller.companyId ?? currentCompanyId();
    const cfg = await this.rules.resolveFor(companyId);
    const now = new Date();
    const category = (dto.category ?? 'general') as CommunicationCategory;

    const requiresAck = dto.requiresAck ?? cfg.requiredAckCategories.includes(category);
    const requiresResponse = dto.requiresResponse ?? cfg.requiredResponseCategories.includes(category);
    const criticality: CommunicationCriticality = CRITICALITIES.includes(dto.criticality as CommunicationCriticality)
      ? (dto.criticality as CommunicationCriticality)
      : cfg.criticalCategories.includes(category)
        ? 'critical'
        : 'normal';
    const responseDueAt = requiresResponse ? new Date(now.getTime() + cfg.requiredResponseHours * 3_600_000) : null;
    const responsibleRole = dto.responsibleRole?.trim() || cfg.responsibleByCategory[category] || null;
    const channel = dto.channel?.trim() || cfg.channels[0] || null;

    const comm = await this.comms.save(
      this.comms.create({
        companyId,
        projectBusinessKey: dto.projectKey?.trim() || null,
        commId: `COM-${randomUUID().slice(0, 8).toUpperCase()}`,
        category,
        criticality,
        channel,
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
        requiresAck,
        requiresResponse,
        responsibleRole,
        actionDueDate: dto.actionDueDate || null,
        responseDueAt,
        linkedClaimKey: dto.linkedClaimKey?.trim() || null,
        linkedRecordKey: dto.linkedRecordKey?.trim() || null,
        sentAt: now,
        deliveredAt: now,
        createdByEmail: caller.email,
      }),
    );

    const policyWarnings = this.policyWarnings(comm, cfg);
    await this.writeAudit(caller, comm, 'comm.sent', {
      category, criticality, requiresAck, requiresResponse, channel, recipient: comm.recipientEmail, policyWarnings,
    });
    return this.enrich(comm, cfg, policyWarnings);
  }

  async list(caller: User, projectKey?: string): Promise<EnrichedCommunication[]> {
    const cid = caller.companyId ?? currentCompanyId();
    const cfg = await this.rules.resolveFor(cid);
    const where: Record<string, unknown> = {};
    if (cid) where.companyId = cid;
    if (projectKey) where.projectBusinessKey = projectKey;
    const rows = await this.comms.find({ where, order: { createdAt: 'DESC' }, take: 200 });
    return rows.map((c) => this.enrich(c, cfg));
  }

  /** Unopened communications past the alert window (for escalation/alerts). */
  async overdue(caller: User): Promise<EnrichedCommunication[]> {
    const cid = caller.companyId ?? currentCompanyId();
    const cfg = await this.rules.resolveFor(cid);
    const cutoff = new Date(Date.now() - cfg.unreadAlertHours * 3_600_000);
    const rows = await this.comms.find({
      where: { ...(cid ? { companyId: cid } : {}), openedAt: IsNull(), sentAt: LessThan(cutoff) },
      order: { sentAt: 'ASC' },
      take: 200,
    });
    return rows.map((c) => this.enrich(c, cfg));
  }

  /**
   * Open inside Sigma — the strong, authenticated evidence of access. Records
   * openedAt + the authenticated opener the FIRST time, and audits it.
   */
  async open(id: string, caller: User): Promise<EnrichedCommunication> {
    const comm = await this.load(id, caller);
    if (!comm.openedAt) {
      comm.openedAt = new Date();
      comm.openedByEmail = caller.email;
      if (comm.status === 'sent' || comm.status === 'delivered') comm.status = 'opened';
      await this.comms.save(comm);
      await this.writeAudit(caller, comm, 'comm.opened', { authenticatedOpen: true });
    }
    return this.enrichResolved(comm);
  }

  /** Viewing an attachment is distinct, stronger evidence than merely opening. */
  async viewAttachment(id: string, caller: User): Promise<EnrichedCommunication> {
    const comm = await this.load(id, caller);
    const now = new Date();
    // Viewing an attachment implies authenticated access — record the open too.
    if (!comm.openedAt) { comm.openedAt = now; comm.openedByEmail = caller.email; }
    if (!comm.attachmentViewedAt) {
      comm.attachmentViewedAt = now;
      comm.attachmentViewedByEmail = caller.email;
      if (comm.status === 'sent' || comm.status === 'delivered' || comm.status === 'opened') comm.status = 'attachment_viewed';
      await this.comms.save(comm);
      await this.writeAudit(caller, comm, 'comm.attachment_viewed', { authenticatedView: true });
    }
    return this.enrichResolved(comm);
  }

  async acknowledge(id: string, caller: User): Promise<EnrichedCommunication> {
    const comm = await this.load(id, caller);
    if (!comm.openedAt) { comm.openedAt = new Date(); comm.openedByEmail = caller.email; }
    comm.acknowledgedAt = new Date();
    comm.acknowledgedByEmail = caller.email;
    comm.status = 'acknowledged';
    await this.comms.save(comm);
    await this.writeAudit(caller, comm, 'comm.acknowledged', {});
    return this.enrichResolved(comm);
  }

  async respond(id: string, caller: User, dto: { decision: 'accepted' | 'rejected'; reply?: string }): Promise<EnrichedCommunication> {
    if (!['accepted', 'rejected'].includes(dto.decision)) throw new BadRequestException('decision must be accepted|rejected');
    const comm = await this.load(id, caller);
    if (!comm.openedAt) { comm.openedAt = new Date(); comm.openedByEmail = caller.email; }
    comm.respondedAt = new Date();
    comm.responseDecision = dto.decision;
    comm.reply = dto.reply?.trim() || null;
    comm.status = dto.decision;
    await this.comms.save(comm);
    await this.writeAudit(caller, comm, 'comm.responded', { decision: dto.decision });
    return this.enrichResolved(comm);
  }

  /** Record that the required action was completed (close-out evidence). */
  async completeAction(id: string, caller: User): Promise<EnrichedCommunication> {
    const comm = await this.load(id, caller);
    comm.actionCompletedAt = new Date();
    comm.status = 'action_completed';
    await this.comms.save(comm);
    await this.writeAudit(caller, comm, 'comm.action_completed', {});
    return this.enrichResolved(comm);
  }

  /** Record that no action was taken (the deliberate-inaction evidence). */
  async noAction(id: string, caller: User, reason?: string): Promise<EnrichedCommunication> {
    const comm = await this.load(id, caller);
    comm.noActionAt = new Date();
    comm.status = 'no_action';
    await this.comms.save(comm);
    await this.writeAudit(caller, comm, 'comm.no_action', { reason: reason?.trim()?.slice(0, 500) || null });
    return this.enrichResolved(comm);
  }

  /** A party formally disputes the communication or its receipt. */
  async dispute(id: string, caller: User, reason?: string): Promise<EnrichedCommunication> {
    const comm = await this.load(id, caller);
    comm.disputedAt = new Date();
    comm.disputedByEmail = caller.email;
    comm.disputeReason = reason?.trim()?.slice(0, 2000) || null;
    comm.status = 'disputed';
    await this.comms.save(comm);
    await this.writeAudit(caller, comm, 'comm.disputed', { reason: comm.disputeReason });
    return this.enrichResolved(comm);
  }

  /** Link the communication to a claim / approval / delay / risk record. */
  async link(id: string, caller: User, dto: { linkedClaimKey?: string | null; linkedRecordKey?: string | null }): Promise<EnrichedCommunication> {
    const comm = await this.load(id, caller);
    if (dto.linkedClaimKey !== undefined) comm.linkedClaimKey = dto.linkedClaimKey?.trim() || null;
    if (dto.linkedRecordKey !== undefined) comm.linkedRecordKey = dto.linkedRecordKey?.trim() || null;
    await this.comms.save(comm);
    await this.writeAudit(caller, comm, 'comm.linked', { linkedClaimKey: comm.linkedClaimKey, linkedRecordKey: comm.linkedRecordKey });
    return this.enrichResolved(comm);
  }

  /** Manual escalation — advances to the next matrix tier (or an explicit role). */
  async escalate(id: string, caller: User, toRole?: string): Promise<EnrichedCommunication> {
    const comm = await this.load(id, caller);
    const cfg = await this.rules.resolveFor(comm.companyId);
    const nextLevel = (comm.escalationLevel ?? 0) + 1;
    const tier = cfg.escalationLevels.find((t) => t.level === nextLevel) ?? cfg.escalationLevels[cfg.escalationLevels.length - 1];
    const role = toRole?.trim() || tier?.toRole || 'pmo';
    await this.applyEscalation(comm, role, nextLevel);
    await this.writeAudit(caller, comm, 'comm.escalated', { level: comm.escalationLevel, toRole: role, manual: true });
    await this.notifyEscalation(comm);
    return this.enrich(comm, cfg);
  }

  /** The full audit-event trail for one communication (the audit-log reference). */
  async auditTrail(id: string, caller: User): Promise<AuditLog[]> {
    const comm = await this.load(id, caller);
    return this.audit.find({ where: { path: `/communications/${comm.id}` }, order: { createdAt: 'ASC' }, take: 200 });
  }

  // ── alert / escalation engine ──────────────────────────────────────────────

  /** Run the alert + escalation sweep for the caller's company. */
  async runAlerts(caller: User): Promise<{ scanned: number; alerted: number; escalated: number; deemed: number }> {
    const cid = caller.companyId ?? currentCompanyId();
    return this.sweepCompany(cid);
  }

  /**
   * Cron entry — sweep EVERY company (and the global/unscoped bucket). Runs with
   * no request/tenant context, so it resolves rules per-company explicitly.
   */
  async runAlertsForAll(): Promise<{ companies: number; alerted: number; escalated: number; deemed: number }> {
    const distinct = await this.comms
      .createQueryBuilder('c')
      .select('DISTINCT c.companyId', 'companyId')
      .where('c.openedAt IS NULL')
      .getRawMany<{ companyId: string | null }>();
    let alerted = 0, escalated = 0, deemed = 0;
    for (const row of distinct) {
      const r = await this.sweepCompany(row.companyId);
      alerted += r.alerted; escalated += r.escalated; deemed += r.deemed;
    }
    return { companies: distinct.length, alerted, escalated, deemed };
  }

  private async sweepCompany(companyId: string | null): Promise<{ scanned: number; alerted: number; escalated: number; deemed: number }> {
    const cfg = await this.rules.resolveFor(companyId);
    const candidates = await this.comms.find({
      where: {
        ...(companyId ? { companyId } : { companyId: IsNull() }),
        openedAt: IsNull(),
        status: Not('disputed'),
      },
      take: 1000,
    });
    const now = Date.now();
    let alerted = 0, escalated = 0, deemed = 0;
    for (const comm of candidates) {
      const ageH = comm.sentAt ? (now - new Date(comm.sentAt).getTime()) / 3_600_000 : 0;
      let dirty = false;

      // Deemed-notice: an unopened official notice is deemed served (when contractually enabled).
      if (cfg.deemedNoticeEnabled && !comm.deemedServedAt && ageH >= cfg.deemedNoticeHours) {
        comm.deemedServedAt = new Date();
        dirty = true; deemed++;
        await this.writeSystemAudit(comm, 'comm.deemed_served', { ageHours: Math.round(ageH), afterHours: cfg.deemedNoticeHours });
      }

      // 24h unread alert — fire once.
      if (!comm.firstAlertAt && ageH >= cfg.unreadAlertHours) {
        comm.firstAlertAt = new Date();
        dirty = true; alerted++;
        await this.notifyUnread(comm, Math.round(ageH));
        await this.writeSystemAudit(comm, 'comm.alert', { unreadHours: Math.round(ageH), threshold: cfg.unreadAlertHours });
      }

      // Matrix escalation — advance to the highest tier whose window has elapsed.
      const dueTier = [...cfg.escalationLevels].sort((a, b) => b.afterHours - a.afterHours).find((t) => ageH >= t.afterHours);
      if (dueTier && dueTier.level > (comm.escalationLevel ?? 0)) {
        await this.applyEscalation(comm, dueTier.toRole, dueTier.level);
        dirty = true; escalated++;
        await this.writeSystemAudit(comm, 'comm.escalated', { level: dueTier.level, toRole: dueTier.toRole, auto: true, ageHours: Math.round(ageH) });
        await this.notifyEscalation(comm);
      }

      if (dirty) await this.comms.save(comm);
    }
    return { scanned: candidates.length, alerted, escalated, deemed };
  }

  // ── helpers ─────────────────────────────────────────────────────────────────

  private async applyEscalation(comm: Communication, toRole: string, level: number): Promise<void> {
    const now = new Date();
    comm.escalatedAt = comm.escalatedAt ?? now;
    comm.lastEscalationAt = now;
    comm.escalationLevel = level;
    comm.escalatedToRole = toRole;
    comm.escalatedToEmail = await this.resolveRoleEmail(comm.companyId, toRole);
    if (comm.status !== 'disputed') comm.status = 'escalated';
  }

  /** Find an active recipient in the company for an escalation-target role. */
  private async resolveRoleEmail(companyId: string | null, role: string): Promise<string | null> {
    const user = await this.users.findOne({
      where: { ...(companyId ? { companyId } : {}), role: role as User['role'] },
      order: { createdAt: 'ASC' },
    });
    return user?.email ?? null;
  }

  private policyWarnings(comm: Communication, cfg: CommunicationRulesConfig): string[] {
    const w: string[] = [];
    if (cfg.approvedRecipients.length && comm.recipientEmail && !cfg.approvedRecipients.includes(comm.recipientEmail)) {
      w.push(`Recipient ${comm.recipientEmail} is not on the approved-recipients list.`);
    }
    if (cfg.approvedRoles.length && comm.recipientRole && !cfg.approvedRoles.includes(comm.recipientRole)) {
      w.push(`Recipient role ${comm.recipientRole} is not on the approved-roles list.`);
    }
    if (cfg.channels.length && comm.channel && !cfg.channels.includes(comm.channel)) {
      w.push(`Channel ${comm.channel} is not an approved official channel.`);
    }
    return w;
  }

  private enrich(c: Communication, cfg: CommunicationRulesConfig, policyWarnings?: string[]): EnrichedCommunication {
    const now = Date.now();
    const unopened = !c.openedAt;
    const ageH = c.sentAt ? (now - new Date(c.sentAt).getTime()) / 3_600_000 : null;
    const nextTier = [...cfg.escalationLevels].sort((a, b) => a.afterHours - b.afterHours).find((t) => t.level > (c.escalationLevel ?? 0));
    return Object.assign(c, {
      overdue: unopened && ageH !== null && ageH > cfg.unreadAlertHours,
      unreadHours: unopened && ageH !== null ? Math.round(ageH) : null,
      responseOverdue: !!c.requiresResponse && !c.respondedAt && !!c.responseDueAt && new Date(c.responseDueAt).getTime() < now,
      escalationDue: !!nextTier && ageH !== null && ageH >= nextTier.afterHours && unopened,
      alertThresholdHours: cfg.unreadAlertHours,
      ...(policyWarnings && policyWarnings.length ? { policyWarnings } : {}),
    });
  }

  private async enrichResolved(c: Communication): Promise<EnrichedCommunication> {
    const cfg = await this.rules.resolveFor(c.companyId);
    return this.enrich(c, cfg);
  }

  private async load(id: string, caller: User): Promise<Communication> {
    const comm = await this.comms.findOne({ where: { id } });
    if (!comm) throw new NotFoundException('Communication not found');
    const cid = caller.companyId ?? currentCompanyId();
    if (cid && comm.companyId && comm.companyId !== cid) throw new ForbiddenException('Not your communication');
    return comm;
  }

  private async notifyUnread(comm: Communication, hours: number): Promise<void> {
    if (!comm.recipientEmail) return;
    await this.notifications.send({
      channel: 'email',
      to: comm.recipientEmail,
      subject: `[Sigma] Unread official communication ${comm.commId} (${hours}h)`,
      body: `Official communication ${comm.commId} — "${comm.subject}" — has not been opened in Sigma after ${hours}h. Please open and acknowledge it.`,
      context: { commId: comm.commId, category: comm.category, criticality: comm.criticality, actionDueDate: comm.actionDueDate },
    });
  }

  private async notifyEscalation(comm: Communication): Promise<void> {
    const to = comm.escalatedToEmail ?? comm.recipientEmail;
    if (!to) return;
    await this.notifications.send({
      channel: 'email',
      to,
      subject: `[Sigma] Escalation L${comm.escalationLevel} — ${comm.commId}`,
      body: `Communication ${comm.commId} — "${comm.subject}" — has been escalated to ${comm.escalatedToRole} (level ${comm.escalationLevel}) as it remains unopened/unactioned.`,
      context: { commId: comm.commId, escalatedToRole: comm.escalatedToRole, level: comm.escalationLevel },
    });
  }

  private async writeAudit(caller: User, comm: Communication, action: string, meta: Record<string, unknown>): Promise<void> {
    await this.persistAudit({
      companyId: comm.companyId,
      actorUserId: caller.id,
      actorEmail: caller.email,
      actorRole: caller.role,
      action,
      comm,
      meta,
    });
  }

  /** System-actor audit row (cron / engine has no authenticated caller). */
  private async writeSystemAudit(comm: Communication, action: string, meta: Record<string, unknown>): Promise<void> {
    await this.persistAudit({
      companyId: comm.companyId,
      actorUserId: null,
      actorEmail: 'system@sigma',
      actorRole: 'system',
      action,
      comm,
      meta,
    });
  }

  private async persistAudit(p: {
    companyId: string | null; actorUserId: string | null; actorEmail: string; actorRole: string;
    action: string; comm: Communication; meta: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.audit.save(
        this.audit.create({
          companyId: p.companyId,
          actorUserId: p.actorUserId,
          actorEmail: p.actorEmail,
          actorRole: p.actorRole,
          action: p.action,
          method: 'POST',
          path: `/communications/${p.comm.id}`,
          statusCode: 200,
          ip: null,
          meta: { commId: p.comm.commId, subject: p.comm.subject, status: p.comm.status, category: p.comm.category, projectKey: p.comm.projectBusinessKey, ...p.meta },
        }),
      );
    } catch (err) {
      this.logger.warn(`Comm audit skipped: ${(err as Error).message}`);
    }
  }
}
