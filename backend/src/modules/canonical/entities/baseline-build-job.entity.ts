import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * BaselineBuildJob — a record of one AI-driven Primavera baseline build
 * (post-meeting plan §3.1, ADR-0010 §6).
 *
 * The job moves through a small state machine:
 *
 *     pending → running → awaiting-approval → committed
 *                              │
 *                              └─→ failed
 *
 * Wave 1 ships **the entity only** — the actual MPXJ PMXML writer, the
 * Anthropic Computer Use Demo Path, and the human approval gate are all
 * Wave 2+ work and are deliberately not scaffolded here per the execution
 * envelope.
 */
@Entity('baseline_build_job')
export class BaselineBuildJob extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /** SourceFile ids of the drawings the job will plan from. */
  @Column({ type: 'json' })
  drawingsSourceFileIds!: string[];

  /** The persona this job runs under, e.g. `planner-p6-25yr`. */
  @Column({ type: 'varchar', length: 64 })
  personaSlug!: string;

  /** `pending` | `running` | `awaiting-approval` | `committed` | `failed`. */
  @Column({ type: 'varchar', length: 32 })
  status!: string;

  @Column({ type: 'int', default: 0 })
  progressPercent!: number;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  completedAt!: Date | null;

  /** SourceFile id of the generated XER/PMXML if successful. */
  @Column({ type: 'char', length: 36, nullable: true })
  outputXerSourceFileId!: string | null;

  @Column({ type: 'text', nullable: true })
  operatorNotes!: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason!: string | null;

  /**
   * Dual-signature approval (post-meeting plan §3.1: «توقيع الاثنين مطلوب»).
   * First signer lands here; the job moves to `awaiting-second-approval`
   * and only a DIFFERENT `canApproveBaseline` holder can complete the
   * commit. NULL until the first signature.
   */
  @Column({ type: 'varchar', length: 128, nullable: true })
  firstApprovedBy!: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  firstApprovedAt!: Date | null;
}
