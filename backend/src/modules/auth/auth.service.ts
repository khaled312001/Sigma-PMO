import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../canonical/entities';
import { Role } from './roles.enum';

/**
 * Encapsulates auth-related operations: hashing the supplied API key, looking
 * up users by hashed key, and counting active admins for sole-admin protection.
 * Extracts the duplicated sha-256 + DB lookup from ApiKeyGuard + AuthController.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  hashApiKey(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex');
  }

  findActiveByApiKey(rawKey: string): Promise<User | null> {
    return this.users.findOne({ where: { apiKeyHash: this.hashApiKey(rawKey), active: true } });
  }

  countUsers(): Promise<number> {
    return this.users.count();
  }

  countActiveAdmins(excludeUserId?: string): Promise<number> {
    const qb = this.users
      .createQueryBuilder('u')
      .where('u.role = :role', { role: Role.SIGMA_ADMIN })
      .andWhere('u.active = :active', { active: true });
    if (excludeUserId) qb.andWhere('u.id != :id', { id: excludeUserId });
    return qb.getCount();
  }

  /**
   * Returns true when the caller is permitted to operate in bootstrap mode
   * (no users exist yet). In production this requires the BOOTSTRAP_TOKEN
   * env var to be set AND the request header `x-bootstrap-token` to match it.
   * In non-production environments bootstrap mode is permissive for dev
   * ergonomics, with a one-time warning logged on first encounter.
   */
  isBootstrapPermitted(suppliedToken: string | undefined): boolean {
    const env = this.config.get<string>('env');
    const required = (this.config.get<string>('bootstrapToken') ?? '').trim();

    if (env === 'production') {
      if (!required) return false; // fail-closed in prod when token not set
      return suppliedToken === required;
    }

    if (!this.bootstrapWarned) {
      this.logger.warn(
        'Bootstrap mode permissive (no users + non-production env). Create the first admin to enable RBAC enforcement.',
      );
      this.bootstrapWarned = true;
    }
    return true;
  }

  private bootstrapWarned = false;
}
