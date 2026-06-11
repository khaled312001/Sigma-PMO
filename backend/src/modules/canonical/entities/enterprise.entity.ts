import { Column, Entity, Index } from 'typeorm';

import { TraceableEntity } from '../../../common/entities/base.entity';
import { GovernanceStatus } from '../../../common/enums';

/**
 * Enterprise — the top of the governance hierarchy
 * (Enterprise → Portfolio → Program → Project), per Mr. Ayham's 2026-06-11
 * multi-level governance requirement.
 *
 * Extends {@link TraceableEntity} so the same append-only versioning every
 * canonical entity carries applies here too — re-org of the enterprise tree
 * inserts new versions, never overwrites. `governanceStatus` is the rolled-up
 * 4-tier status computed by the GovernanceStatusService.
 */
@Entity('enterprise')
export class Enterprise extends TraceableEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  description!: string | null;

  /** Rolled-up 4-tier governance status (worst-of descendant portfolios). */
  @Index()
  @Column({ type: 'varchar', length: 16, default: GovernanceStatus.GREEN })
  governanceStatus!: GovernanceStatus | string;
}
