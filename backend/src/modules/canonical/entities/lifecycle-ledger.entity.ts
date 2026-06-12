import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * LifecycleLedgerEntry — the Quantity Governance + Cost Governance traceability
 * ledger (Mr. Ayham, 2026-06-12 follow-up). Append-only: every recorded value
 * at every lifecycle stage is a new row, never an overwrite, so the platform
 * can always answer "where did this number come from, how/why did it change,
 * who approved it, what evidence supports it".
 *
 * A "subject" is the thing being tracked (a classified element, a BOQ item, a
 * procurement package…). `dimension` selects the chain: quantity (BIM → … →
 * Paid) or cost (Budget → … → Final). The CURRENT value at each stage is the
 * latest `isCurrent` row for (project, dimension, subjectKey, stage); prior
 * rows are the change history.
 */
@Entity('lifecycle_ledger')
@Index(['projectBusinessKey', 'dimension', 'subjectKey', 'stage'])
export class LifecycleLedgerEntry extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /** quantity | cost. */
  @Index()
  @Column({ type: 'varchar', length: 16 })
  dimension!: string;

  /** The tracked subject, e.g. "element:frame", "package:PKG-001", "boq:2.1". */
  @Index()
  @Column({ type: 'varchar', length: 128 })
  subjectKey!: string;

  @Column({ type: 'varchar', length: 255 })
  subjectLabel!: string;

  /** The lifecycle stage (chain position) — see traceability-chains.ts. */
  @Index()
  @Column({ type: 'varchar', length: 24 })
  stage!: string;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  value!: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  unit!: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  currency!: string | null;

  /**
   * Where the number came from: bim-model | boq | tender | procurement |
   * delivery | installation | claim | certificate | payment | estimate |
   * manual. The "origin" half of the audit answer.
   */
  @Column({ type: 'varchar', length: 32 })
  originType!: string;

  /** Id/reference of the originating artefact (BIM record id, BOQ key, …). */
  @Column({ type: 'varchar', length: 128, nullable: true })
  originRef!: string | null;

  /** Why the value changed at this stage (the "why" of the audit answer). */
  @Column({ type: 'varchar', length: 512, nullable: true })
  changeReason!: string | null;

  /** Who approved this value/change (the "who" of the audit answer). */
  @Column({ type: 'varchar', length: 128, nullable: true })
  approvedBy!: string | null;

  /** Evidence links: [{ type, ref, note }] (the "what evidence" answer). */
  @Column({ type: 'json', nullable: true })
  evidenceRefs!: Array<Record<string, unknown>> | null;

  /** The prior current row this entry superseded (the change-history link). */
  @Column({ type: 'char', length: 36, nullable: true })
  supersedesId!: string | null;

  @Index()
  @Column({ type: 'boolean', default: true })
  isCurrent!: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true })
  recordedBy!: string | null;
}
