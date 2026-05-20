import { Column, Entity, Index } from 'typeorm';

import { TraceableEntity } from '../../../common/entities/base.entity';

/**
 * Canonical assignment of a Resource to an Activity, with planned vs actual
 * units and cost — the basis for resource-based deviation signals in Cycle 2.
 */
@Entity('resource_assignment')
export class ResourceAssignment extends TraceableEntity {
  @Index()
  @Column({ type: 'char', length: 36 })
  activityId!: string;

  @Index()
  @Column({ type: 'char', length: 36 })
  resourceId!: string;

  @Column({ type: 'double', nullable: true })
  plannedUnits!: number | null;

  @Column({ type: 'double', nullable: true })
  actualUnits!: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  plannedCost!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  actualCost!: string | null;
}
