import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * SafetyRecord — a record under Safety Governance (Mr. Ayham, 2026-06-13 full
 * governance lifecycle). Governs implementation of approved HSE plans during
 * execution: HSE plans, daily/weekly/monthly reports, inspections, permits to
 * work, incidents, near-misses, corrective actions, toolbox talks and audits.
 * Stop-work events carry the claim chain — Safety Event -> Stop Work -> Delay
 * (eotDays) -> Critical Path impact -> EOT indicator -> Claim readiness.
 * Append-only by (businessKey, isCurrent).
 */
@Entity('safety_record')
@Index(['projectBusinessKey', 'isCurrent'])
export class SafetyRecord extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /** Stable natural key, e.g. "SAF-002". */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  businessKey!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  /**
   * hse_plan | daily_report | weekly_report | monthly_report | inspection |
   * permit_to_work | incident | near_miss | corrective_action | toolbox_talk |
   * audit.
   */
  @Column({ type: 'varchar', length: 32 })
  recordType!: string;

  /** info | low | medium | high | critical. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  severity!: string | null;

  /** open | in_progress | closed. */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: string;

  @Column({ type: 'date', nullable: true })
  recordDate!: string | null;

  /** A stop-work order was raised on this record (drives the claim chain). */
  @Column({ type: 'boolean', default: false })
  stopWork!: boolean;

  /** Canonical Activity businessKeys/WBS impacted by this safety event. */
  @Column({ type: 'json', nullable: true })
  affectedActivityKeys!: string[] | null;

  /** Extension-of-time days attributable to this safety event (claim quantum). */
  @Column({ type: 'int', nullable: true })
  eotDays!: number | null;

  /** Free-form payload: inspection checklist, permit scope, RCA, etc. */
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
