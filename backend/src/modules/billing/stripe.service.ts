import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Stripe from 'stripe';
import { Repository } from 'typeorm';

import type { StripeConfig } from '../../config/configuration';
import { Company } from '../canonical/entities/company.entity';
import { Subscription, SubscriptionStatus } from '../canonical/entities/subscription.entity';
import { User } from '../canonical/entities';

/** Stripe client instance type (the v22 default export is the constructor). */
type StripeClient = InstanceType<typeof Stripe>;

// Minimal shapes for the webhook objects we read — avoids depending on the
// nested Stripe.* namespace types, which aren't reachable via dotted access in
// this packaging of stripe-node (export = StripeConstructor).
type Ref = string | { id: string } | null | undefined;
interface SessionLike { metadata?: Record<string, string> | null; customer?: Ref; subscription?: Ref }
interface SubscriptionLike { id: string; status: string; customer?: Ref; metadata?: Record<string, string> | null; trial_end?: number | null; current_period_end?: number | null }
interface InvoiceLike { metadata?: Record<string, string> | null }

/**
 * Stripe billing (multi-tenant SaaS). Config-driven: when `stripe.enabled`
 * (STRIPE_SECRET_KEY + STRIPE_PRICE_ID set) a company is sent to Stripe Checkout
 * in `subscription` mode with a `trial_period_days` trial (default 30) — the
 * card is captured now, no charge until the trial ends, then Stripe charges
 * automatically. A webhook keeps the local Subscription + Company status in
 * sync with Stripe. When NOT configured, everything degrades gracefully (the
 * trial subscription created at registration keeps the app fully usable in dev).
 *
 * Discipline: the secret key is read ONLY from config (env) — never hardcoded.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private client: StripeClient | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  private cfg(): StripeConfig {
    return this.config.get<StripeConfig>('stripe')!;
  }

  isEnabled(): boolean {
    return this.cfg().enabled;
  }

  publishableKey(): string {
    return this.cfg().publishableKey;
  }

  private stripe(): StripeClient {
    if (!this.client) this.client = new Stripe(this.cfg().secretKey);
    return this.client;
  }

  /**
   * Create a Stripe Checkout session for a company's subscription (with the
   * trial) and return its hosted URL. Returns null when billing is not
   * configured so callers can fall back to the no-billing flow.
   */
  async createCheckoutUrl(company: Company, email: string): Promise<string | null> {
    const c = this.cfg();
    if (!c.enabled) return null;
    try {
      const session = await this.stripe().checkout.sessions.create({
        mode: 'subscription',
        customer_email: email,
        line_items: [{ price: c.priceId, quantity: 1 }],
        subscription_data: {
          trial_period_days: c.trialDays,
          metadata: { companyId: company.id, slug: company.slug },
        },
        metadata: { companyId: company.id, slug: company.slug },
        allow_promotion_codes: true,
        success_url: `${c.appUrl}/c/${company.slug}?welcome=1`,
        cancel_url: `${c.appUrl}/register?canceled=1`,
      });
      return session.url ?? null;
    } catch (e) {
      this.logger.error(`Stripe checkout creation failed: ${(e as Error).message}`);
      return null;
    }
  }

  /** Re-create a checkout session for the caller's own company (re-subscribe). */
  async checkoutForUser(user: User): Promise<string | null> {
    if (!user.companyId) throw new ForbiddenException('Caller is not scoped to a company');
    const company = await this.companies.findOne({ where: { id: user.companyId } });
    if (!company) throw new NotFoundException('Company not found');
    return this.createCheckoutUrl(company, user.email);
  }

  /** Subscription status for the caller's company (dashboard billing badge). */
  async statusForUser(user: User): Promise<{ enabled: boolean; status: string; trialEndsAt: Date | null; plan: string } | null> {
    if (!user.companyId) return null;
    const sub = await this.subs.findOne({ where: { companyId: user.companyId } });
    return {
      enabled: this.isEnabled(),
      status: sub?.status ?? 'trial',
      trialEndsAt: sub?.trialEndsAt ?? null,
      plan: sub?.plan ?? 'trial',
    };
  }

  /**
   * Verify + apply a Stripe webhook event. Keeps the local Subscription +
   * Company in sync (trial → active → past_due/cancelled). Signature is
   * verified against STRIPE_WEBHOOK_SECRET using the raw request body.
   */
  async handleWebhook(raw: Buffer, signature: string | undefined): Promise<{ received: boolean }> {
    const c = this.cfg();
    if (!c.enabled) throw new BadRequestException('Billing is not configured');
    if (!signature) throw new BadRequestException('Missing stripe-signature header');

    let event: ReturnType<StripeClient['webhooks']['constructEvent']>;
    try {
      event = this.stripe().webhooks.constructEvent(raw, signature, c.webhookSecret);
    } catch (e) {
      throw new BadRequestException(`Webhook signature verification failed: ${(e as Error).message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as SessionLike;
        await this.apply(s.metadata?.companyId ?? null, {
          stripeCustomerId: this.idOf(s.customer),
          stripeSubscriptionId: this.idOf(s.subscription),
          status: 'trial',
        });
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as SubscriptionLike;
        await this.apply(sub.metadata?.companyId ?? null, {
          stripeSubscriptionId: sub.id,
          stripeCustomerId: this.idOf(sub.customer),
          status: mapStripeStatus(sub.status),
          trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
          currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
        });
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as InvoiceLike;
        await this.apply(inv.metadata?.companyId ?? null, { status: 'past_due' });
        break;
      }
      default:
        break;
    }
    return { received: true };
  }

  private idOf(v: Ref): string | null {
    if (!v) return null;
    return typeof v === 'string' ? v : v.id;
  }

  /** Apply a status/ids patch to the company's Subscription + Company rows. */
  private async apply(
    companyId: string | null,
    patch: Partial<Pick<Subscription, 'stripeCustomerId' | 'stripeSubscriptionId' | 'trialEndsAt' | 'currentPeriodEnd'>> & {
      status?: SubscriptionStatus;
    },
  ): Promise<void> {
    if (!companyId) {
      this.logger.warn('Stripe event without companyId metadata — ignored');
      return;
    }
    const sub = await this.subs.findOne({ where: { companyId } });
    if (sub) {
      Object.assign(sub, patch);
      if (patch.status === 'active') sub.plan = 'pro';
      await this.subs.save(sub);
    }
    const company = await this.companies.findOne({ where: { id: companyId } });
    if (company && patch.status) {
      const companyStatus: Record<SubscriptionStatus, Company['status']> = {
        trial: 'trial',
        active: 'active',
        past_due: 'active', // grace period — keep them in, super-admin can suspend
        cancelled: 'suspended',
      };
      company.status = companyStatus[patch.status];
      if (patch.status === 'active') company.plan = 'pro';
      await this.companies.save(company);
    }
  }
}

function mapStripeStatus(s: string): SubscriptionStatus {
  switch (s) {
    case 'trialing':
      return 'trial';
    case 'active':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    default:
      return 'cancelled'; // canceled | incomplete | incomplete_expired | paused
  }
}
