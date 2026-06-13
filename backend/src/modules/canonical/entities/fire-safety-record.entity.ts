import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * FireSafetyRecord — a fire-strategy / authority-approval record under Fire &
 * Life Safety Governance (Mr. Ayham, 2026-06-13 17-stage lifecycle scope).
 * Tracks fire-strategy compliance and authority approvals (Civil Defence):
 * fire strategy + drawings, civil-defence reviews, testing & commissioning and
 * inspections, with the open-comment count, submission/approval-forecast dates
 * and the approval status driving Fire Readiness. Append-only by (businessKey,
 * isCurrent) — same discipline as every canonical versioned entity.
 */
@Entity('fire_safety_record')
@Index(['projectBusinessKey', 'isCurrent'])
export class FireSafetyRecord extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /** Stable natural key, e.g. "FLS-002". */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  businessKey!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  /** fire_strategy | fire_drawing | civil_defense_review | testing_commissioning | inspection. */
  @Column({ type: 'varchar', length: 32 })
  recordType!: string;

  /** Approving authority, e.g. "Civil Defence". */
  @Column({ type: 'varchar', length: 64, nullable: true })
  authority!: string | null;

  /** draft | submitted | under_review | comments | approved | rejected. */
  @Column({ type: 'varchar', length: 24, default: 'submitted' })
  status!: string;

  /** Outstanding authority comments on this record. */
  @Column({ type: 'int', default: 0 })
  openComments!: number;

  @Column({ type: 'date', nullable: true })
  submittedDate!: string | null;

  @Column({ type: 'date', nullable: true })
  approvalForecastDate!: string | null;

  /** low | medium | high | critical (optional manual override hint). */
  @Column({ type: 'varchar', length: 16, nullable: true })
  severity!: string | null;

  /** Comment log + history + supporting refs: { comments:[], history:[] }. */
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
