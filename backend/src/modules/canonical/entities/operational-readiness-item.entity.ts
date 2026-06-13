import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * OperationalReadinessItem — a single readiness item under Operational Readiness
 * Governance (Mr. Ayham, 2026-06-13: the full 17-stage governance lifecycle).
 * Governs the construction-complete → operational go-live transition: O&M
 * manuals, asset registers, training, testing & commissioning, handover,
 * staffing, spares and warranties. Append-only by (businessKey, isCurrent).
 */
@Entity('operational_readiness_item')
@Index(['projectBusinessKey', 'isCurrent'])
export class OperationalReadinessItem extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /** Stable natural key, e.g. "OPR-002". */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  businessKey!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  /** om_manual | asset_register | training | testing_commissioning | handover | staffing | spares | warranty. */
  @Column({ type: 'varchar', length: 32 })
  category!: string;

  /** not_started | in_progress | submitted | approved | complete. */
  @Column({ type: 'varchar', length: 24, default: 'not_started' })
  status!: string;

  /** 0..100 percent complete for this readiness item. */
  @Column({ type: 'double', nullable: true })
  completionPct!: number | null;

  @Column({ type: 'date', nullable: true })
  dueDate!: string | null;

  /** Evidence + checklist + history: { checklist:[], evidence:[] }. */
  @Column({ type: 'json', nullable: true })
  details!: Record<string, unknown> | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Index()
  @Column({ type: 'boolean', default: true })
  isCurrent!: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true })
  createdBy!: string | null;
}
