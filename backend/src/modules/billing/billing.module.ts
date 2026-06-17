import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { BillingController } from './billing.controller';
import { StripeService } from './stripe.service';

/**
 * SaaS billing (Stripe). Config-driven: enabled only when STRIPE_SECRET_KEY +
 * STRIPE_PRICE_ID are set; otherwise the checkout/webhook surface degrades
 * gracefully and the app stays usable on the trial subscription. Reuses the
 * Company/Subscription/User repositories from CanonicalModule + AuthService.
 */
@Module({
  imports: [CanonicalModule, AuthModule],
  controllers: [BillingController],
  providers: [StripeService],
  exports: [StripeService],
})
export class BillingModule {}
