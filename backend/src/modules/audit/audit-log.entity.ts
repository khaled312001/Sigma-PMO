import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../common/entities/base.entity';

/**
 * Append-only platform audit log. One row per state-changing request
 * (POST/PUT/PATCH/DELETE) and per authentication attempt, written by
 * `AuditInterceptor`. Records WHO (actor + company), WHAT (action/method/path),
 * the OUTCOME (HTTP status), and WHEN (`createdAt`) — never request bodies, so
 * passwords/secrets are never persisted. Always-on; not gated by any flag.
 *
 * Read back, company-scoped, at `GET /audit` (a company admin sees only their
 * own tenant's entries; the platform super-admin sees all).
 */
@Entity('audit_log')
@Index(['companyId', 'createdAt'])
export class AuditLog extends UuidEntity {
  /** Tenant scope of the actor (null = platform super-admin / unauthenticated). */
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  companyId!: string | null;

  /** The acting user's id (null for unauthenticated calls such as a failed login). */
  @Column({ type: 'char', length: 36, nullable: true })
  actorUserId!: string | null;

  /** The acting user's email (or the attempted email on a login). */
  @Column({ type: 'varchar', length: 320, nullable: true })
  actorEmail!: string | null;

  /** The actor's role at the time of the action. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  actorRole!: string | null;

  /** Logical action — e.g. `auth.login`, `auth.login.failed`, `http.post`. */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  action!: string;

  /** HTTP method of the request. */
  @Column({ type: 'varchar', length: 8, nullable: true })
  method!: string | null;

  /** Request path (query string stripped). */
  @Column({ type: 'varchar', length: 512, nullable: true })
  path!: string | null;

  /** Resulting HTTP status code (200, 403, 404, 500, …). */
  @Column({ type: 'int', nullable: true })
  statusCode!: number | null;

  /** Caller IP (best-effort: x-forwarded-for or socket address). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  ip!: string | null;

  /** Small, non-sensitive structured context (never the request body). */
  @Column({ type: 'json', nullable: true })
  meta!: Record<string, unknown> | null;
}
