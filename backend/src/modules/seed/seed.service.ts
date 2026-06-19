import { randomBytes } from 'node:crypto';

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { SecurityConfig } from '../../config/configuration';
import { Company, User } from '../canonical/entities';
import { AuthService } from '../auth/auth.service';
import { Role } from '../auth/roles.enum';

/** Fixed id for the default tenant — matches the backfill id used by the
 *  Tenancy/Billing migrations so seeded users line up with any legacy rows. */
const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

interface DemoUser {
  role: Role;
  email: string;
  displayName: string;
  /**
   * Privileged accounts (platform admin / reviewer) are NEVER given a public,
   * predictable password and never appear in the one-click sample picker. Their
   * password comes from ADMIN_SEED_PASSWORD (or a generated random, logged once).
   */
  privileged?: boolean;
}

/** The sample role accounts. The 13 non-privileged ones power the one-click
 *  demo picker (shared rotated password); admin + reviewer are privileged. */
const DEMO_USERS: DemoUser[] = [
  { role: Role.SIGMA_ADMIN, email: 'admin@sigma.local', displayName: 'Sigma Admin', privileged: true },
  { role: Role.SIGMA_REVIEWER, email: 'reviewer@sigma.local', displayName: 'Sigma Reviewer', privileged: true },
  { role: Role.CLIENT, email: 'client@sigma.ae', displayName: 'Al Ayham (Client)' },
  { role: Role.CONSULTANT, email: 'consultant@sigma.ae', displayName: 'Site Consultant' },
  { role: Role.CONTRACTOR, email: 'contractor@sigma.ae', displayName: 'Main Contractor' },
  { role: Role.SUBCONTRACTOR, email: 'subcontractor@sigma.ae', displayName: 'Subcontractor' },
  { role: Role.OWNER, email: 'owner@sigma.ae', displayName: 'Asset Owner' },
  { role: Role.OPERATOR, email: 'operator@sigma.ae', displayName: 'Facility Operator' },
  { role: Role.INVESTOR, email: 'investor@sigma.ae', displayName: 'Equity Investor' },
  { role: Role.LENDER, email: 'lender@sigma.ae', displayName: 'Financing Bank' },
  { role: Role.PMO, email: 'pmo@sigma.ae', displayName: 'PMO Office' },
  { role: Role.GOVERNANCE_BOARD, email: 'board@sigma.ae', displayName: 'Governance Board' },
  { role: Role.BANK, email: 'bank@sigma.ae', displayName: 'Financing Bank' },
  { role: Role.GOVERNMENT_REGULATOR, email: 'regulator@sigma.ae', displayName: 'Government Regulator' },
  { role: Role.ASSET_MANAGER, email: 'assetmgr@sigma.ae', displayName: 'Asset Manager' },
];

/**
 * First-boot demo seeder. When `SEED_DEMO=true` it ensures a default company +
 * the sample role accounts exist (idempotent). Every seeded account is flagged
 * `isDemo=true`, so on a UAT / production box (`DEMO_LOGIN_PUBLIC=false`) they
 * are refused authentication at the API — the sample login is dead, not merely
 * hidden. Sample passwords are rotated from config on every boot; the privileged
 * admin/reviewer never get a public password. Never crashes startup on failure.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const security = this.config.get<SecurityConfig>('security');
    if (!security?.seedDemo) return;
    try {
      await this.ensureDefaultCompany();

      // Resolve the privileged (admin/reviewer) password: env-only, else a
      // strong random generated here and logged ONCE — never from source.
      let adminPassword = (security.adminSeedPassword ?? '').trim();
      let adminGenerated = false;
      if (!adminPassword) {
        adminPassword = `Sg-${randomBytes(12).toString('base64url')}`;
        adminGenerated = true;
      }

      let created = 0;
      let refreshed = 0;
      for (const acct of DEMO_USERS) {
        const password = acct.privileged ? adminPassword : security.demoPassword;
        const { hash, salt } = this.auth.hashPassword(password);
        const existing = await this.users.findOne({ where: { email: acct.email } });
        if (existing) {
          existing.passwordHash = hash;
          existing.passwordSalt = salt;
          existing.role = acct.role;
          existing.active = true;
          existing.isDemo = true;
          existing.companyId = existing.companyId ?? DEFAULT_COMPANY_ID;
          await this.users.save(existing);
          refreshed++;
        } else {
          await this.users.save(
            this.users.create({
              email: acct.email,
              displayName: acct.displayName,
              role: acct.role,
              apiKeyHash: this.auth.hashApiKey(`sk_${randomBytes(24).toString('hex')}`),
              passwordHash: hash,
              passwordSalt: salt,
              projectScopes: '*',
              active: true,
              isDemo: true,
              companyId: DEFAULT_COMPANY_ID,
            }),
          );
          created++;
        }
      }
      this.logger.log(
        `Demo seed complete: ${created} created, ${refreshed} refreshed ` +
          `(company=${DEFAULT_COMPANY_ID}, demoLoginPublic=${security.demoLoginPublic}).`,
      );
      if (adminGenerated) {
        this.logger.warn(
          `ADMIN_SEED_PASSWORD not set — generated a one-time admin password for ` +
            `admin@sigma.local / reviewer@sigma.local: "${adminPassword}". ` +
            `Set ADMIN_SEED_PASSWORD in the environment for a stable, private admin login.`,
        );
      }
    } catch (err) {
      this.logger.warn(`Demo seed skipped: ${(err as Error).message}`);
    }
  }

  private async ensureDefaultCompany(): Promise<void> {
    const existing = await this.companies.findOne({ where: { id: DEFAULT_COMPANY_ID } });
    if (existing) return;
    await this.companies.save(
      this.companies.create({
        id: DEFAULT_COMPANY_ID,
        slug: 'sigma-default',
        name: 'Sigma (default)',
        companyType: 'pmo',
        status: 'active',
        plan: 'enterprise',
        ownerEmail: 'admin@sigma.local',
      }),
    );
    this.logger.log(`Default company created (${DEFAULT_COMPANY_ID}).`);
  }
}
