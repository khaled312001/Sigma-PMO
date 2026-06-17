import { Body, Controller, Get, Headers, HttpCode, NotFoundException, Param, Post, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { User } from '../canonical/entities';
import { AuthService } from '../auth/auth.service';
import { RequiresCapability } from '../auth/require-capability.decorator';
import { OnboardingService } from './onboarding.service';
import type { AddCompanyUserDto, RegisterCompanyDto } from './onboarding.service';

/**
 * SaaS onboarding: public company self-registration + the company owner's
 * company-scoped user management.
 *  - `GET  /onboarding/types`     (public)  — construction-entity type catalog.
 *  - `POST /onboarding/register`  (public)  — create company + owner, returns an API key.
 *  - `GET  /onboarding/company`   (canRead) — the caller's company.
 *  - `GET  /onboarding/users`     (canRead) — the caller's company roster.
 *  - `POST /onboarding/users`     (canRead) — owner adds a user to their company.
 */
@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly auth: AuthService,
  ) {}

  @Get('types')
  listTypes() {
    return this.onboarding.listTypes();
  }

  @Post('register')
  @HttpCode(200)
  @Throttle({ auth: { limit: 8, ttl: 60_000 } })
  register(@Body() body: RegisterCompanyDto) {
    return this.onboarding.register(body);
  }

  /** Public company branding for the per-company login page (/c/:slug). */
  @Get('public/:slug')
  async publicCompany(@Param('slug') slug: string) {
    const c = await this.onboarding.publicCompany(slug);
    if (!c) throw new NotFoundException('Company not found');
    return c;
  }

  @Get('company')
  @RequiresCapability('canRead')
  async company(@Headers('x-api-key') rawKey?: string) {
    const c = await this.onboarding.companyFor(await this.caller(rawKey));
    if (!c) return null;
    return {
      id: c.id, slug: c.slug, name: c.name, companyType: c.companyType,
      status: c.status, plan: c.plan, country: c.country, createdById: c.createdById,
    };
  }

  @Get('users')
  @RequiresCapability('canRead')
  async users(@Headers('x-api-key') rawKey?: string) {
    return this.onboarding.listCompanyUsers(await this.caller(rawKey));
  }

  @Post('users')
  @HttpCode(200)
  @RequiresCapability('canRead')
  async addUser(@Headers('x-api-key') rawKey: string | undefined, @Body() body: AddCompanyUserDto) {
    return this.onboarding.addUser(await this.caller(rawKey), body);
  }

  /** A company raises a support / request ticket to the platform. */
  @Post('support')
  @HttpCode(200)
  @RequiresCapability('canRead')
  async createSupport(
    @Headers('x-api-key') rawKey: string | undefined,
    @Body() body: { kind?: 'support' | 'request' | 'billing'; subject: string; body?: string },
  ) {
    return this.onboarding.createSupport(await this.caller(rawKey), body);
  }

  @Get('support')
  @RequiresCapability('canRead')
  async mySupport(@Headers('x-api-key') rawKey?: string) {
    return this.onboarding.listMySupport(await this.caller(rawKey));
  }

  private async caller(rawKey?: string): Promise<User> {
    if (!rawKey) throw new UnauthorizedException('Missing x-api-key');
    const user = await this.auth.findActiveByApiKey(rawKey);
    if (!user) throw new UnauthorizedException('Invalid API key');
    return user;
  }
}
