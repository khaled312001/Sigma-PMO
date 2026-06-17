import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';

/**
 * Platform SUPER_ADMIN console — manages all companies, subscriptions and
 * support/requests across the multi-tenant SaaS. Repos come from CanonicalModule.
 */
@Module({
  imports: [CanonicalModule],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
  exports: [SuperAdminService],
})
export class SuperAdminModule {}
