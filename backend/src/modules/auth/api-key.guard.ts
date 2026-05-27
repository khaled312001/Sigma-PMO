import { createHash } from 'node:crypto';

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../canonical/entities';
import { Role, ROLE_CAPABILITIES } from './roles.enum';

export const REQUIRED_CAPABILITY = 'requiredCapability';

export type Capability = keyof (typeof ROLE_CAPABILITIES)[Role];

/**
 * API-key authentication + coarse capability check. Reads `x-api-key`, hashes
 * it (sha-256), looks up the User by that hash, and authorises if the user's
 * role grants the route's required capability. The route declares its needed
 * capability via the @RequiresCapability(...) decorator.
 *
 * Behaviour without auth setup: if no users exist, all requests are allowed
 * (developer mode). The first real User row enables enforcement.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const capability = this.reflector.get<Capability | undefined>(REQUIRED_CAPABILITY, context.getHandler());
    if (!capability) return true;

    // Open-mode bootstrap: while no users exist, do not enforce. Once an admin
    // is created (seed), enforcement kicks in for every subsequent request.
    const userCount = await this.users.count();
    if (userCount === 0) return true;

    const req = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: User }>();
    const rawKey = req.headers['x-api-key'];
    if (!rawKey) throw new UnauthorizedException('Missing x-api-key');

    const hash = createHash('sha256').update(rawKey).digest('hex');
    const user = await this.users.findOne({ where: { apiKeyHash: hash, active: true } });
    if (!user) throw new UnauthorizedException('Invalid API key');

    const caps = ROLE_CAPABILITIES[user.role as Role] ?? null;
    if (!caps || !caps[capability]) throw new UnauthorizedException(`Role ${user.role} lacks capability ${capability}`);

    req.user = user;
    return true;
  }
}
