import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * BoqItem — a single line in a Bill of Quantities document (post-meeting plan
 * §3.7).
 *
 * Each line carries an optional `activityRef` (an `Activity.businessKey`) so
 * the planner persona can ground duration estimates in the BoQ rather than
 * inventing them — see ADR-0010 and the `planner-p6-25yr` persona rule
 * *"do not invent quantities or durations"*. Wave 1 ships the entity only;
 * the importer + activity-link resolver land with the BoQ pipeline in C2.
 */
@Entity('boq_item')
export class BoqItem extends UuidEntity {
  /** FK to the BoQ header. */
  @Index()
  @Column({ type: 'char', length: 36 })
  boqId!: string;

  @Column({ type: 'varchar', length: 32 })
  itemNumber!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'varchar', length: 16 })
  unit!: string;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  quantity!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  unitRate!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount!: string;

  /** Optional link to an `Activity.businessKey` for cross-grounding. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  activityRef!: string | null;
}
