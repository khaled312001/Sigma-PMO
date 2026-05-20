import { Column, Entity, Index } from 'typeorm';

import { TraceableEntity } from '../../../common/entities/base.entity';
import { ReportType } from '../../../common/enums';

/** Canonical progress Report entity (daily / weekly / monthly submissions). */
@Entity('report')
export class Report extends TraceableEntity {
  @Index()
  @Column({ type: 'char', length: 36 })
  projectId!: string;

  @Column({ type: 'varchar', length: 16 })
  reportType!: ReportType;

  @Column({ type: 'date' })
  reportDate!: string;

  @Column({ type: 'date', nullable: true })
  periodStart!: string | null;

  @Column({ type: 'date', nullable: true })
  periodEnd!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  submittedBy!: string | null;

  /** Reported overall progress as a fraction in [0, 1]. */
  @Column({ type: 'double', nullable: true })
  reportedPctComplete!: number | null;

  @Column({ type: 'text', nullable: true })
  narrative!: string | null;

  /** Free-form structured metrics carried from the source report. */
  @Column({ type: 'json' })
  metrics!: Record<string, unknown>;
}
