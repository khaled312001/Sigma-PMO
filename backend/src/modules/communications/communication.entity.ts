import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../common/entities/base.entity';

export type CommunicationCategory =
  | 'rfi' | 'ncr' | 'delay-notice' | 'approval-request' | 'claim-notice'
  | 'instruction' | 'variation' | 'daily-report' | 'meeting-minutes' | 'general';

export type CommunicationStatus =
  | 'sent' | 'delivered' | 'opened' | 'attachment_viewed' | 'acknowledged'
  | 'accepted' | 'rejected' | 'action_completed' | 'no_action' | 'escalated' | 'disputed';

/** Notice criticality — drives required-ack + escalation aggressiveness. */
export type CommunicationCriticality = 'low' | 'normal' | 'high' | 'critical';

/**
 * Communication-governance record (Mr. Ayham, 2026-06-19). A reliable, traceable,
 * auditable record of a project communication/notice. The stronger evidence is
 * the AUTHENTICATED open inside Sigma (`openedAt`/`openedByEmail`) — not a plain
 * email read-receipt. The lifecycle distinguishes sent → delivered → opened →
 * attachment-viewed → acknowledged → accepted/rejected → action-completed, with
 * 24h unread + escalation flags. Every event is written to the audit log.
 */
@Entity('communication')
export class Communication extends UuidEntity {
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  companyId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  projectBusinessKey!: string | null;

  /** Human reference (e.g. COM-1042). */
  @Index()
  @Column({ type: 'varchar', length: 32 })
  commId!: string;

  @Index()
  @Column({ type: 'varchar', length: 32, default: 'general' })
  category!: CommunicationCategory;

  /** Notice criticality (resolved from rules per-category, or set explicitly). */
  @Column({ type: 'varchar', length: 16, default: 'normal' })
  criticality!: CommunicationCriticality;

  /** Approved channel this communication was registered on (per rules). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  channel!: string | null;

  @Column({ type: 'varchar', length: 512 })
  subject!: string;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  /** Attachment descriptors (name/bytes) — content is archived separately. */
  @Column({ type: 'json', nullable: true })
  attachments!: Array<{ name: string; bytes?: number }> | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  senderEmail!: string | null;
  @Column({ type: 'varchar', length: 32, nullable: true })
  senderRole!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  recipientEmail!: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true })
  recipientCompany!: string | null;
  @Column({ type: 'varchar', length: 32, nullable: true })
  recipientRole!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 24, default: 'sent' })
  status!: CommunicationStatus;

  /** Critical notices require an explicit acknowledgement. */
  @Column({ type: 'boolean', default: false })
  requiresAck!: boolean;

  /** Notice requires a content decision (accept/reject) within the response SLA. */
  @Column({ type: 'boolean', default: false })
  requiresResponse!: boolean;

  @Column({ type: 'date', nullable: true })
  actionDueDate!: string | null;

  /** Deadline for the required response (per the response-time SLA). */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  responseDueAt!: Date | null;

  /** Responsible party (role) accountable for acting on this communication. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  responsibleRole!: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  sentAt!: Date | null;
  @Column({ type: 'datetime', precision: 6, nullable: true })
  deliveredAt!: Date | null;

  /** Authenticated open inside Sigma — the strong evidence of access. */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  openedAt!: Date | null;
  @Column({ type: 'varchar', length: 320, nullable: true })
  openedByEmail!: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  attachmentViewedAt!: Date | null;
  @Column({ type: 'varchar', length: 320, nullable: true })
  attachmentViewedByEmail!: string | null;
  @Column({ type: 'datetime', precision: 6, nullable: true })
  acknowledgedAt!: Date | null;
  @Column({ type: 'varchar', length: 320, nullable: true })
  acknowledgedByEmail!: string | null;
  @Column({ type: 'datetime', precision: 6, nullable: true })
  respondedAt!: Date | null;

  /** Action lifecycle — explicit close-out (acted on) or recorded inaction. */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  actionCompletedAt!: Date | null;
  @Column({ type: 'datetime', precision: 6, nullable: true })
  noActionAt!: Date | null;

  /**
   * Deemed-served timestamp. When deemed-notice is contractually approved, an
   * unopened official notice is treated as served after the configured window —
   * this records WHEN that rule was applied (the evidentiary deeming event).
   */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  deemedServedAt!: Date | null;

  /** First automatic unread alert (24h rule) — set once to avoid duplicate alerts. */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  firstAlertAt!: Date | null;

  /** Dispute trail — a party formally contests the communication/its receipt. */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  disputedAt!: Date | null;
  @Column({ type: 'varchar', length: 320, nullable: true })
  disputedByEmail!: string | null;
  @Column({ type: 'text', nullable: true })
  disputeReason!: string | null;

  /** accepted | rejected (content decision — distinct from merely opening). */
  @Column({ type: 'varchar', length: 16, nullable: true })
  responseDecision!: string | null;
  @Column({ type: 'text', nullable: true })
  reply!: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  escalatedAt!: Date | null;
  @Column({ type: 'int', nullable: true })
  escalationLevel!: number | null;
  /** Who the latest escalation was directed to (per the communication matrix). */
  @Column({ type: 'varchar', length: 32, nullable: true })
  escalatedToRole!: string | null;
  @Column({ type: 'varchar', length: 320, nullable: true })
  escalatedToEmail!: string | null;
  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastEscalationAt!: Date | null;

  /** Governance linkage — ties this communication to a claim/approval/delay/risk record. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  linkedClaimKey!: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true })
  linkedRecordKey!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  createdByEmail!: string | null;
}
