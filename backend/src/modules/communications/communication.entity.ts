import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../common/entities/base.entity';

export type CommunicationCategory =
  | 'rfi' | 'ncr' | 'delay-notice' | 'approval-request' | 'claim-notice'
  | 'instruction' | 'variation' | 'daily-report' | 'meeting-minutes' | 'general';

export type CommunicationStatus =
  | 'sent' | 'delivered' | 'opened' | 'acknowledged'
  | 'accepted' | 'rejected' | 'action_completed' | 'escalated' | 'disputed';

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

  @Column({ type: 'date', nullable: true })
  actionDueDate!: string | null;

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
  @Column({ type: 'datetime', precision: 6, nullable: true })
  acknowledgedAt!: Date | null;
  @Column({ type: 'datetime', precision: 6, nullable: true })
  respondedAt!: Date | null;

  /** accepted | rejected (content decision — distinct from merely opening). */
  @Column({ type: 'varchar', length: 16, nullable: true })
  responseDecision!: string | null;
  @Column({ type: 'text', nullable: true })
  reply!: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  escalatedAt!: Date | null;
  @Column({ type: 'int', nullable: true })
  escalationLevel!: number | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  createdByEmail!: string | null;
}
