import { Column, Entity, Index } from 'typeorm';

import { TraceableEntity } from '../../../common/entities/base.entity';
import { GovernanceStatus, LifecyclePhase } from '../../../common/enums';

/**
 * Program — third governance level
 * (Enterprise → Portfolio → **Program** → Project).
 *
 * A program aggregates related projects. `portfolioBusinessKey` links up the
 * chain by businessKey. `currentPhase` carries the program-level governance
 * lifecycle position; `governanceStatus` is the worst-of-children roll-up
 * across its projects.
 */
@Entity('program')
export class Program extends TraceableEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  description!: string | null;

  /** Parent portfolio businessKey (nullable until linked). */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  portfolioBusinessKey!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  governanceOwner!: string | null;

  /** Program-level lifecycle position. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  currentPhase!: LifecyclePhase | string | null;

  /** Rolled-up 4-tier governance status (worst-of child projects). */
  @Index()
  @Column({ type: 'varchar', length: 16, default: GovernanceStatus.GREEN })
  governanceStatus!: GovernanceStatus | string;
}
