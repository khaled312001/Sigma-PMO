import { Column, Entity, Index } from 'typeorm';

import { TraceableEntity } from '../../../common/entities/base.entity';
import { ResourceType } from '../../../common/enums';

/** Canonical Resource entity (labour / material / equipment / non-labour). */
@Entity('resource')
export class Resource extends TraceableEntity {
  /** Optional FK to a Project (resources may be project-scoped or shared). */
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  projectId!: string | null;

  @Column({ type: 'varchar', length: 512 })
  name!: string;

  @Column({ type: 'varchar', length: 32 })
  resourceType!: ResourceType;

  @Column({ type: 'varchar', length: 32, nullable: true })
  unitOfMeasure!: string | null;

  @Column({ type: 'double', nullable: true })
  maxUnitsPerDay!: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  standardRate!: string | null;
}
