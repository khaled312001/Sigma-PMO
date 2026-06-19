import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Query } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import type { CompanyStatus } from '../canonical/entities/company.entity';
import type { SubscriptionStatus } from '../canonical/entities/subscription.entity';
import type { SupportStatus } from '../canonical/entities/support-request.entity';
import { SuperAdminService } from './super-admin.service';

/**
 * `/super-admin/**` — the platform SUPER_ADMIN console (above all companies).
 * Gated on `canManagePlatform` (sigma_admin). Manages companies, subscriptions,
 * and support/requests, and surfaces platform-wide analytics. The same app
 * dashboard chrome hosts these as extra pages for the super-admin.
 */
@Controller('super-admin')
export class SuperAdminController {
  constructor(private readonly svc: SuperAdminService) {}

  @Get('analytics')
  @RequiresCapability('canManagePlatform')
  analytics() {
    return this.svc.analytics();
  }

  @Get('companies')
  @RequiresCapability('canManagePlatform')
  companies() {
    return this.svc.listCompanies();
  }

  @Patch('companies/:id/status')
  @HttpCode(200)
  @RequiresCapability('canManagePlatform')
  setCompanyStatus(@Param('id') id: string, @Body() body: { status: CompanyStatus }) {
    return this.svc.setCompanyStatus(id, body.status);
  }

  /** Hard-delete a company (tenant) + its users, subscription and tickets. */
  @Delete('companies/:id')
  @HttpCode(200)
  @RequiresCapability('canManagePlatform')
  deleteCompany(@Param('id') id: string) {
    return this.svc.deleteCompany(id);
  }

  @Get('subscriptions')
  @RequiresCapability('canManagePlatform')
  subscriptions() {
    return this.svc.listSubscriptions();
  }

  @Patch('subscriptions/:id')
  @HttpCode(200)
  @RequiresCapability('canManagePlatform')
  updateSubscription(
    @Param('id') id: string,
    @Body()
    body: {
      plan?: string;
      status?: SubscriptionStatus;
      seats?: number;
      renewsAt?: string | null;
      mrr?: number;
      trialEndsAt?: string | null;
    },
  ) {
    return this.svc.updateSubscription(id, body);
  }

  @Get('requests')
  @RequiresCapability('canManagePlatform')
  requests(@Query('status') status?: SupportStatus) {
    return this.svc.listRequests(status);
  }

  @Patch('requests/:id')
  @HttpCode(200)
  @RequiresCapability('canManagePlatform')
  updateRequest(@Param('id') id: string, @Body() body: { status?: SupportStatus; reply?: string }) {
    return this.svc.updateRequest(id, body);
  }
}
