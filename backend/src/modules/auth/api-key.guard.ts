import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthService } from './auth.service';
import { CapabilitiesService } from './capabilities.service';
import { ROLE_CAPABILITIES, Role } from './roles.enum';

export const REQUIRED_CAPABILITY = 'requiredCapability';

export type Capability = keyof (typeof ROLE_CAPABILITIES)[Role];

/**
 * API-key authentication + coarse capability check.
 *
 *  1. Routes with no @RequiresCapability() pass through.
 *  2. Routes that require a capability:
 *     - If no users exist, behaviour depends on AuthService.isBootstrapPermitted():
 *       - production + valid `x-bootstrap-token` header → allow (for first-admin creation)
 *       - production + missing/invalid token → 503 (fail-closed)
 *       - non-production → allow (with one-time warning)
 *     - Else, extract `x-api-key`, sha-256 lookup, capability check.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly capabilities: CapabilitiesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const capability = this.reflector.get<Capability | undefined>(REQUIRED_CAPABILITY, context.getHandler());
    if (!capability) return true;

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: unknown;
    }>();

    const userCount = await this.auth.countUsers();

    if (userCount === 0) {
      const bootstrapToken = req.headers['x-bootstrap-token'];
      if (!this.auth.isBootstrapPermitted(bootstrapToken)) {
        throw new ServiceUnavailableException(
          'Platform in bootstrap mode but BOOTSTRAP_TOKEN is required in this environment. ' +
            'Provide the x-bootstrap-token header matching BOOTSTRAP_TOKEN env var.',
        );
      }
      return true;
    }

    const rawKey = req.headers['x-api-key'];
    if (!rawKey) throw new UnauthorizedException('Missing x-api-key');

    const user = await this.auth.findActiveByApiKey(rawKey);
    if (!user) throw new UnauthorizedException('Invalid API key');

    // Effective check — merges admin-set overrides with the hardcoded defaults
    // (CapabilitiesService keeps the merged matrix in memory).
    if (!this.capabilities.can(user.role, capability)) {
      throw new UnauthorizedException(`Role ${user.role} lacks capability ${capability}`);
    }

    (req as { user?: unknown }).user = user;
    return true;
  }
}
