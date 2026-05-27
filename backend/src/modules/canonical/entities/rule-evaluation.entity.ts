import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';
import { RuleEvaluationStatus } from '../../../common/enums';

/** One execution of the rule engine against the current canonical snapshot. */
@Entity('rule_evaluation')
export class RuleEvaluation extends UuidEntity {
  /** Null = evaluation ran across all projects. */
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  projectId!: string | null;

  @Column({ type: 'varchar', length: 16 })
  status!: RuleEvaluationStatus;

  @Column({ type: 'datetime', precision: 6 })
  startedAt!: Date;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  finishedAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  alertCount!: number;

  /** Per-rule counts, error trace, runtime stats. */
  @Column({ type: 'json' })
  summary!: Record<string, unknown>;
}
