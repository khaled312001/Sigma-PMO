import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * QualityRecord — a record under QA/QC Governance (Mr. Ayham, 2026-06-20
 * acceptance #4). One polymorphic, append-only register covering the full
 * construction-quality lifecycle: Inspection Requests (WIR), Material Inspection
 * Requests (MIR), Method Statements, Inspection & Test Plans (ITP) with hold &
 * witness points, Non-Conformance Reports (NCR), corrective actions, test
 * reports and lab results. A blocking NCR carries the claim chain —
 * NCR -> Rework/Delay (eotDays) + Cost -> Critical Path impact -> EOT/Cost
 * indicator -> Claim readiness — so a quality failure traces to delay, cost and
 * a potential claim. Append-only by (businessKey, isCurrent).
 */
@Entity('quality_record')
@Index(['projectBusinessKey', 'isCurrent'])
export class QualityRecord extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /** Stable natural key, e.g. "NCR-002", "WIR-005", "ITP-001". */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  businessKey!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  /**
   * inspection_request (WIR) | material_inspection (MIR) | method_statement |
   * itp | ncr | corrective_action | test_report.
   */
  @Index()
  @Column({ type: 'varchar', length: 32 })
  recordType!: string;

  /** info | low | medium | high | critical (NCR/test severity). */
  @Column({ type: 'varchar', length: 16, nullable: true })
  severity!: string | null;

  /** open | in_progress | closed. */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: string;

  @Column({ type: 'date', nullable: true })
  recordDate!: string | null;

  /** NCR disposition: rework | repair | use_as_is | reject (null until decided). */
  @Column({ type: 'varchar', length: 16, nullable: true })
  disposition!: string | null;

  /** Inspection/test outcome for WIR/MIR/ITP/test_report: pass | fail | conditional. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  inspectionResult!: string | null;

  /** ITP/inspection hold point — progress is blocked until it is signed off. */
  @Column({ type: 'boolean', default: false })
  holdPoint!: boolean;

  /** ITP/inspection witness point — a witness must be notified/attend. */
  @Column({ type: 'boolean', default: false })
  witnessPoint!: boolean;

  /** True when this NCR/failed inspection blocks progress (drives the claim chain). */
  @Column({ type: 'boolean', default: false })
  blocksProgress!: boolean;

  /** Canonical Activity businessKeys/WBS impacted by this quality event. */
  @Column({ type: 'json', nullable: true })
  affectedActivityKeys!: string[] | null;

  /** Extension-of-time days attributable to the rework/delay (claim quantum). */
  @Column({ type: 'int', nullable: true })
  eotDays!: number | null;

  /** Cost impact of the rework/repair (claim quantum). */
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  costImpact!: string | null;

  /** businessKey of the inspection this record re-tests (the reinspection loop). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  reinspectionOf!: string | null;

  /** Claim id this NCR was promoted into, when applicable. */
  @Column({ type: 'char', length: 36, nullable: true })
  linkedClaimId!: string | null;

  /** Free-form payload: checklist, acceptance criteria, lab results, closure evidence sourceFileIds. */
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
