import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { User } from '../canonical/entities';
import { AuthService } from '../auth/auth.service';
import { RequiresCapability } from '../auth/require-capability.decorator';
import { StripeService } from './stripe.service';

/**
 * SaaS billing (Stripe). Public config + webhook; authenticated checkout/status.
 *  - `GET  /billing/config`   (public)  — { enabled, publishableKey } for the UI.
 *  - `POST /billing/webhook`  (public)  — Stripe webhook (raw body, signed).
 *  - `POST /billing/checkout` (canRead) — (re)create a Checkout session URL.
 *  - `GET  /billing/status`   (canRead) — the caller's subscription status.
 */
@Controller('billing')
export class BillingController {
  constructor(
    private readonly stripe: StripeService,
    private readonly auth: AuthService,
  ) {}

  @Get('config')
  config() {
    return { enabled: this.stripe.isEnabled(), publishableKey: this.stripe.publishableKey() };
  }

  /** Public plan catalog (pricing + upgrade picker). */
  @Get('plans')
  plans() {
    return this.stripe.plans();
  }

  /** Stripe Customer Portal URL — manage card / invoices / cancellation. */
  @Post('portal')
  @HttpCode(200)
  @RequiresCapability('canRead')
  async portal(@Headers('x-api-key') rawKey?: string) {
    const url = await this.stripe.createPortalUrl(await this.caller(rawKey));
    return { url };
  }

  /**
   * Stripe webhook. The raw (unparsed) request body is required for signature
   * verification — main.ts mounts `express.raw()` for exactly this path so
   * `req.body` arrives as a Buffer.
   */
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: Request, @Headers('stripe-signature') signature?: string) {
    return this.stripe.handleWebhook(req.body as Buffer, signature);
  }

  @Post('checkout')
  @HttpCode(200)
  @RequiresCapability('canRead')
  async checkout(@Headers('x-api-key') rawKey?: string) {
    const url = await this.stripe.checkoutForUser(await this.caller(rawKey));
    return { url };
  }

  @Get('status')
  @RequiresCapability('canRead')
  async status(@Headers('x-api-key') rawKey?: string) {
    return this.stripe.statusForUser(await this.caller(rawKey));
  }

  private async caller(rawKey?: string): Promise<User> {
    if (!rawKey) throw new UnauthorizedException('Missing x-api-key');
    const user = await this.auth.findActiveByApiKey(rawKey);
    if (!user) throw new UnauthorizedException('Invalid API key');
    return user;
  }
}
