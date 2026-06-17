import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled';

/**
 * Per-company subscription (multi-tenant SaaS). One row per company; the
 * platform SUPER_ADMIN manages plan/status/seats from the super-admin surface.
 */
@Entity('subscription')
export class Subscription extends UuidEntity {
  @Index({ unique: true })
  @Column({ type: 'char', length: 36 })
  companyId!: string;

  @Column({ type: 'varchar', length: 32, default: 'trial' })
  plan!: string;

  @Index()
  @Column({ type: 'varchar', length: 16, default: 'trial' })
  status!: SubscriptionStatus;

  @Column({ type: 'int', default: 1 })
  seats!: number;

  @Column({ type: 'date', nullable: true })
  startedAt!: string | null;

  @Column({ type: 'date', nullable: true })
  renewsAt!: string | null;

  /** Monthly recurring revenue (for the super-admin analytics roll-up). */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  mrr!: string;

  // ── Stripe billing linkage (null until the company completes Checkout). ──
  @Column({ type: 'varchar', length: 64, nullable: true })
  stripeCustomerId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  stripeSubscriptionId!: string | null;

  /** End of the free trial (first real charge date). */
  @Column({ type: 'datetime', nullable: true })
  trialEndsAt!: Date | null;

  /** End of the current paid billing period (renewal date). */
  @Column({ type: 'datetime', nullable: true })
  currentPeriodEnd!: Date | null;
}
