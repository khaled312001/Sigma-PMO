import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';
import { Role } from '../../auth/roles.enum';

/**
 * RBAC principal (Layer 3). Two authentication paths are supported:
 *   1. Programmatic — `x-api-key` header, sha-256 lookup against `apiKeyHash`.
 *   2. Interactive  — email + password (scrypt). `POST /auth/login` rotates a
 *      fresh API key on every successful login; the raw key is shown to the
 *      browser once and persisted only in localStorage.
 *
 * `passwordHash` + `passwordSalt` are nullable for users created during
 * bootstrap or via the CLI without an interactive password — those users
 * keep API-key-only access until an admin assigns a password.
 */
@Entity('user')
export class User extends UuidEntity {
  /**
   * Multi-tenant company scope (SaaS). NULL = platform-level user (SUPER_ADMIN)
   * who operates above all companies; otherwise the company this user belongs
   * to. Backfilled to a default company for pre-SaaS users by the Tenancy
   * migration.
   */
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  companyId!: string | null;

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

  /** scrypt hash of the password (hex). Nullable for API-key-only users. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  passwordHash!: string | null;

  /** Per-user random salt for scrypt (hex). Nullable when no password is set. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  passwordSalt!: string | null;

  /**
   * Emirates ID — 15-digit national identifier (XXX-XXXX-XXXXXXX-X). Optional,
   * captured for stakeholders who operate under UAE identity attestation.
   */
  @Column({ type: 'varchar', length: 18, nullable: true })
  emiratesId!: string | null;

  /**
   * Activity-level scope for SUBCONTRACTOR users (Wave 7, correction-plan
   * §2.9): array of Activity businessKeys this user may see / report on.
   * NULL for every other role (their scope stays project-level via
   * `projectScopes`). Per-surface query filters read this field as the
   * single source of truth.
   */
  @Column({ type: 'json', nullable: true })
  activityScope!: string[] | null;

  /** Comma-separated project business keys this user is scoped to ('*' = all). */
  @Column({ type: 'varchar', length: 1024, default: '*' })
  projectScopes!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;
}
