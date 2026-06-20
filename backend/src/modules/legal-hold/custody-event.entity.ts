import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../common/entities/base.entity';

/**
 * CustodyEvent — one entry in the document chain-of-custody ledger (Mr. Ayham
 * acceptance #6). Append-only: it records what happened to a specific document /
 * result row (received, accessed, exported, integrity-verified, placed/released
 * under hold, delete blocked), by whom, when, and the file's SHA-256 at the time
 * — so every conclusion drawn from a document is defensible back to a custody
 * trail, not just the request-level audit log.
 */
@Entity('custody_event')
@Index(['targetTable', 'targetId'])
export class CustodyEvent extends UuidEntity {
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  companyId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  projectBusinessKey!: string | null;

  @Column({ type: 'varchar', length: 64 })
  targetTable!: string;

  @Index()
  @Column({ type: 'char', length: 36 })
  targetId!: string;

  /**
   * received | accessed | exported | verified | verify_failed | hold_placed |
   * hold_released | delete_blocked | deleted | superseded | voided.
   */
  @Index()
  @Column({ type: 'varchar', length: 24 })
  event!: string;

  @Column({ type: 'varchar', length: 320, nullable: true })
  actorEmail!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  actorRole!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip!: string | null;

  /** The file's SHA-256 at the time of the event (integrity anchor). */
  @Column({ type: 'char', length: 64, nullable: true })
  shaAtEvent!: string | null;

  @Column({ type: 'json', nullable: true })
  detail!: Record<string, unknown> | null;
}
