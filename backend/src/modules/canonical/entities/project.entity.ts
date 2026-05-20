import { Column, Entity } from 'typeorm';

import { TraceableEntity } from '../../../common/entities/base.entity';

/** Canonical Project entity (the top of the Project -> Activity hierarchy). */
@Entity('project')
export class Project extends TraceableEntity {
  @Column({ type: 'varchar', length: 512 })
  name!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  status!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  clientName!: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  currency!: string | null;

  /** Schedule data date ("as-of" date for progress), stored as YYYY-MM-DD. */
  @Column({ type: 'date', nullable: true })
  dataDate!: string | null;

  @Column({ type: 'date', nullable: true })
  plannedStart!: string | null;

  @Column({ type: 'date', nullable: true })
  plannedFinish!: string | null;

  @Column({ type: 'date', nullable: true })
  actualStart!: string | null;

  @Column({ type: 'date', nullable: true })
  actualFinish!: string | null;

  /** Decimal returned as string by the driver to preserve precision. */
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  budgetAtCompletion!: string | null;
}
