import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * Construction-entity company type chosen at sign-up. Drives the default
 * role/module preset the company's users get (see OnboardingService).
 */
export type CompanyType =
  | 'developer_owner'
  | 'contractor'
  | 'consultant'
  | 'pmo'
  | 'investor'
  | 'lender'
  | 'government'
  | 'operator';

export const COMPANY_TYPES: CompanyType[] = [
  'developer_owner',
  'contractor',
  'consultant',
  'pmo',
  'investor',
  'lender',
  'government',
  'operator',
];

export type CompanyStatus = 'trial' | 'active' | 'suspended' | 'cancelled';

/**
 * Company (tenant) — the multi-tenant SaaS top-level account. Every canonical
 * record and user is scoped to a company via `companyId` (added to
 * `TraceableEntity` + `User`); the platform `SUPER_ADMIN` (companyId = null)
 * manages all companies, subscriptions, requests and support. A backfilled
 * "default" company keeps the pre-SaaS single-tenant data working.
 */
@Entity('company')
export class Company extends UuidEntity {
  /** URL-safe unique slug (e.g. "acme-contracting"). */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 120 })
  slug!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  /** Construction-entity type — configures the platform for this company. */
  @Index()
  @Column({ type: 'varchar', length: 32 })
  companyType!: CompanyType;

  @Index()
  @Column({ type: 'varchar', length: 16, default: 'trial' })
  status!: CompanyStatus;

  /** Subscription plan code (free | pro | enterprise | …). */
  @Column({ type: 'varchar', length: 32, default: 'trial' })
  plan!: string;

  @Column({ type: 'varchar', length: 320, nullable: true })
  ownerEmail!: string | null;

  /** S3/local storage key for the company logo (optional). */
  @Column({ type: 'varchar', length: 512, nullable: true })
  logoKey!: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  country!: string | null;

  /** Id of the User who registered the company. */
  @Column({ type: 'char', length: 36, nullable: true })
  createdById!: string | null;
}
