import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../common/entities/base.entity';

/**
 * LegalHold — a preservation hold on a specific result row (Mr. Ayham acceptance
 * #6/#12). While a hold is `active`, the generic delete path refuses to hard-
 * delete the target, so dispute-linked evidence, claims, communications and
 * findings cannot be permanently removed. Releasing a hold is a high-privilege,
 * audited action. One hold targets one (table, id).
 */
@Entity('legal_hold')
@Index(['targetTable', 'targetId', 'status'])
export class LegalHold extends UuidEntity {
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  companyId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  projectBusinessKey!: string | null;

  /** The result table the held row lives in (e.g. evidence_room, claim, communication). */
  @Column({ type: 'varchar', length: 64 })
  targetTable!: string;

  @Index()
  @Column({ type: 'char', length: 36 })
  targetId!: string;

  /** Human label snapshot of the held row at hold time. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  targetLabel!: string | null;

  @Column({ type: 'text' })
  reason!: string;

  /** Dispute / claim / matter reference this hold belongs to. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  matterRef!: string | null;

  /** active | released. */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: string;

  @Column({ type: 'varchar', length: 320, nullable: true })
  placedByEmail!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  releasedByEmail!: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  releasedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  releaseReason!: string | null;
}
