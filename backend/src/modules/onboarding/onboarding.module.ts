import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

/**
 * SaaS onboarding — public company self-registration (choosing the
 * construction-entity type, which configures the platform via the company
 * preset) + the company owner's company-scoped user management. Reuses
 * `AuthService` (key/password) + the Company/User repositories from
 * `CanonicalModule`.
 */
@Module({
  imports: [CanonicalModule, AuthModule, BillingModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
