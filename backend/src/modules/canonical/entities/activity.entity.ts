import { Column, Entity, Index } from 'typeorm';

import { TraceableEntity } from '../../../common/entities/base.entity';

/** Canonical Activity entity (a schedule task within a Project). */
@Entity('activity')
export class Activity extends TraceableEntity {
  /** FK to the Project produced within the same ingestion run (coherent snapshot). */
  @Index()
  @Column({ type: 'char', length: 36 })
  projectId!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  wbsCode!: string | null;

  @Column({ type: 'varchar', length: 512 })
  name!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  activityType!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  status!: string | null;

  @Column({ type: 'date', nullable: true })
  plannedStart!: string | null;

  @Column({ type: 'date', nullable: true })
  plannedFinish!: string | null;

  @Column({ type: 'date', nullable: true })
  actualStart!: string | null;

  @Column({ type: 'date', nullable: true })
  actualFinish!: string | null;

  @Column({ type: 'double', nullable: true })
  plannedDurationDays!: number | null;

  @Column({ type: 'double', nullable: true })
  remainingDurationDays!: number | null;

  /** Progress as a fraction in [0, 1]. */
  @Column({ type: 'double', nullable: true })
  plannedPctComplete!: number | null;

  @Column({ type: 'double', nullable: true })
  actualPctComplete!: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  budgetedCost!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  actualCost!: string | null;
}
