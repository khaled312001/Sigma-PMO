import { Column, Entity, Index } from 'typeorm';

import { TraceableEntity } from '../../../common/entities/base.entity';
import { GovernanceStatus } from '../../../common/enums';

/**
 * Portfolio — second governance level
 * (Enterprise → **Portfolio** → Program → Project).
 *
 * `enterpriseBusinessKey` links up the chain by businessKey (never raw id —
 * see the businessKey-for-rollups rule). Nullable so a portfolio can exist
 * standalone before its enterprise is registered (gradual onboarding).
 */
@Entity('portfolio')
export class Portfolio extends TraceableEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  description!: string | null;

  /** Parent enterprise businessKey (nullable until linked). */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  enterpriseBusinessKey!: string | null;

  /** Strategic alignment note — portfolio-level governance intent. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  strategicAlignment!: string | null;

  /** Rolled-up 4-tier governance status (worst-of descendant programs). */
  @Index()
  @Column({ type: 'varchar', length: 16, default: GovernanceStatus.GREEN })
  governanceStatus!: GovernanceStatus | string;
}
