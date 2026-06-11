import { Column, Entity, Index, Unique } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * RoleCapabilityOverride — a runtime override of one (role, capability) pair,
 * set by an admin from the role-management screen. When a row exists it WINS
 * over the hardcoded `ROLE_CAPABILITIES` default; absence means "use the
 * default". This is what makes "the admin controls the other roles'
 * permissions" actually enforced: the ApiKeyGuard reads the merged matrix on
 * every request via CapabilitiesService.
 */
@Entity('role_capability_override')
@Unique(['role', 'capability'])
export class RoleCapabilityOverride extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 32 })
  role!: string;

  @Column({ type: 'varchar', length: 48 })
  capability!: string;

  @Column({ type: 'boolean' })
  enabled!: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true })
  updatedBy!: string | null;

  @Column({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
