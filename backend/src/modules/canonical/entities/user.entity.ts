import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';
import { Role } from '../../auth/roles.enum';

/**
 * RBAC principal (Layer 3). Identification is by `apiKeyHash` (sha-256 of the
 * raw key) so the raw key is never persisted. Project-scoping is intentionally
 * a comma-separated list rather than a join table for Cycle 7 simplicity;
 * Cycle 8 can promote it to a proper many-to-many when admin/workflow needs it.
 */
@Entity('user')
export class User extends UuidEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'varchar', length: 255 })
  displayName!: string;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  role!: Role;

  @Index({ unique: true })
  @Column({ type: 'char', length: 64 })
  apiKeyHash!: string;

  /** Comma-separated project business keys this user is scoped to ('*' = all). */
  @Column({ type: 'varchar', length: 1024, default: '*' })
  projectScopes!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;
}
