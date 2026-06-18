/**
 * Subscription plans (multi-tenant SaaS). Each plan caps the number of seats
 * (users) a company may create and lists the feature tier it unlocks. The
 * `trial` plan is what every company starts on; paid plans map to a Stripe
 * Price. Seat limits are enforced in `OnboardingService.addUser`.
 */
export interface Plan {
  code: string;
  name: string;
  /** Max users (seats) the company may have, including the owner. */
  seats: number;
  /** Display price per month (USD) — the source of truth for billing is Stripe. */
  monthlyPriceUsd: number;
  /** Feature tier markers (used for plan-based module gating + the pricing UI). */
  features: string[];
}

export const PLANS: Record<string, Plan> = {
  trial: {
    code: 'trial',
    name: 'Trial',
    seats: 3,
    monthlyPriceUsd: 0,
    features: ['core', 'ai', '30-day trial'],
  },
  starter: {
    code: 'starter',
    name: 'Starter',
    seats: 5,
    monthlyPriceUsd: 99,
    features: ['core', 'ai', 'governance', 'reports'],
  },
  pro: {
    code: 'pro',
    name: 'Pro',
    seats: 25,
    monthlyPriceUsd: 299,
    features: ['core', 'ai', 'governance', 'reports', 'investment', 'procurement', 'lifecycle'],
  },
  enterprise: {
    code: 'enterprise',
    name: 'Enterprise',
    seats: 1000,
    monthlyPriceUsd: 0, // custom / contact sales
    features: ['everything', 'sso', 'priority-support', 'audit-export'],
  },
};

export const PLAN_LIST: Plan[] = Object.values(PLANS);

export function planFor(code: string | null | undefined): Plan {
  return (code && PLANS[code]) || PLANS.trial;
}
