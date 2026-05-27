import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';
import { AlertSeverity } from '../../../common/enums';

/**
 * A rule-engine finding. Every alert points at the exact canonical rows that
 * triggered it (project / activity / resource / assignment / report), and at
 * the IngestionRun + SourceFile of those rows — so "why this alert?" answers
 * end-to-end from rule output back to the original source file bytes.
 */
@Entity('alert')
export class Alert extends UuidEntity {
  /** Stable rule identifier, e.g. SCHEDULE_FINISH_SLIPPED. */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Index()
  @Column({ type: 'varchar', length: 16 })
  severity!: AlertSeverity;

  @Column({ type: 'varchar', length: 1024 })
  summary!: string;

  // --- entity traceability (row-specific, version-pinned) ----------------
  @Index()
  @Column({ type: 'char', length: 36 })
  projectId!: string;

  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  activityId!: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  resourceId!: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  assignmentId!: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  reportId!: string | null;

  // --- source provenance (root of the evidence chain) --------------------
  @Index()
  @Column({ type: 'char', length: 36 })
  ingestionRunId!: string;

  @Column({ type: 'char', length: 36 })
  sourceFileId!: string;

  /** Groups all alerts produced by a single RuleEvaluation run. */
  @Index()
  @Column({ type: 'char', length: 36 })
  ruleEvaluationId!: string;

  /** Numeric context: planned, actual, delta, threshold, etc. */
  @Column({ type: 'json' })
  context!: Record<string, unknown>;
}
