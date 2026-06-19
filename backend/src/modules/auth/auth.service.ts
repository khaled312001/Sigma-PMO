import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { SecurityConfig } from '../../config/configuration';
import { Company, Subscription, User } from '../canonical/entities';
import { Role } from './roles.enum';

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384; // N=2^14, conservative for Node single-thread

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
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(Subscription) private readonly subscriptions: Repository<Subscription>,
    private readonly config: ConfigService,
  ) {}

  hashApiKey(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex');
  }

  findActiveByApiKey(rawKey: string): Promise<User | null> {
    return this.users.findOne({ where: { apiKeyHash: this.hashApiKey(rawKey), active: true } });
  }

  /** Issue a fresh API key for the given user; old key invalidated. */
  async issueApiKey(user: User): Promise<string> {
    const rawKey = `sk_${randomBytes(24).toString('hex')}`;
    user.apiKeyHash = this.hashApiKey(rawKey);
    await this.users.save(user);
    return rawKey;
  }

  // ---- Password (scrypt + per-user salt) -----------------------------------

  hashPassword(plain: string): { hash: string; salt: string } {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(plain, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST }).toString('hex');
    return { hash, salt };
  }

  verifyPassword(plain: string, hash: string, salt: string): boolean {
    const candidate = scryptSync(plain, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST });
    const stored = Buffer.from(hash, 'hex');
    if (candidate.length !== stored.length) return false;
    return timingSafeEqual(candidate, stored);
  }

  async authenticateByPassword(email: string, password: string): Promise<User | null> {
    const user = await this.users.findOne({ where: { email: email.toLowerCase(), active: true } });
    if (!user || !user.passwordHash || !user.passwordSalt) return null;
    if (!this.verifyPassword(password, user.passwordHash, user.passwordSalt)) return null;
    // Demo (sample) accounts cannot authenticate on a UAT / production box.
    if (user.isDemo && !this.demoLoginPublic()) {
      this.logger.warn(`Demo account login refused (DEMO_LOGIN_PUBLIC=false): ${user.email}`);
      return null;
    }
    return user;
  }

  /** Whether seeded sample (isDemo) accounts may authenticate in this env. */
  demoLoginPublic(): boolean {
    return this.config.get<SecurityConfig>('security')?.demoLoginPublic ?? false;
  }

  /**
   * Tenant access gate (multi-tenant SaaS): block a user whose company is
   * suspended/cancelled, or whose trial has ended. The platform super-admin
   * (companyId = null) is never gated. Called by the auth guard on every
   * request and by the login controller. Throws 403 when access is denied.
   */
  async assertCompanyActive(user: Pick<User, 'companyId'>): Promise<void> {
    if (!user.companyId) return; // platform-level user — above all companies
    const company = await this.companies.findOne({ where: { id: user.companyId } });
    if (!company) return; // defensive: no tenant record => do not lock the user out
    if (company.status === 'suspended') {
      throw new ForbiddenException('Your company account is suspended. Please contact the platform administrator.');
    }
    if (company.status === 'cancelled') {
      throw new ForbiddenException('Your company account has been cancelled. Please contact the platform administrator.');
    }
    const sub = await this.subscriptions.findOne({ where: { companyId: user.companyId } });
    if (!sub) return;
    if (sub.status === 'cancelled') {
      throw new ForbiddenException('Your subscription has been cancelled. Please renew to continue.');
    }
    if (sub.status === 'trial' && sub.trialEndsAt && sub.trialEndsAt.getTime() < Date.now()) {
      throw new ForbiddenException('Your free trial has ended. Please subscribe to continue.');
    }
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
