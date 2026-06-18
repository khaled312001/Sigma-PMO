import { randomBytes } from 'node:crypto';

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Company, User } from '../canonical/entities';
import { AuthService } from '../auth/auth.service';
import { Role } from '../auth/roles.enum';

/** Fixed id for the default tenant — matches the backfill id used by the
 *  Tenancy/Billing migrations so seeded users line up with any legacy rows. */
const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

interface DemoUser {
  role: Role;
  email: string;
  password: string;
  displayName: string;
}

/** The 15 demo role accounts surfaced by the login user-picker. Dev/demo
 *  credentials — rotate (or disable seeding) for a real production tenant. */
const DEMO_USERS: DemoUser[] = [
  { role: Role.SIGMA_ADMIN, email: 'admin@sigma.local', password: 'AdminSigma#2026', displayName: 'Sigma Admin' },
  { role: Role.SIGMA_REVIEWER, email: 'reviewer@sigma.local', password: 'ReviewerSigma#2026', displayName: 'Sigma Reviewer' },
  { role: Role.CLIENT, email: 'client@sigma.ae', password: 'ClientSigma#2026', displayName: 'Al Ayham (Client)' },
  { role: Role.CONSULTANT, email: 'consultant@sigma.ae', password: 'ConsultantSigma#2026', displayName: 'Site Consultant' },
  { role: Role.CONTRACTOR, email: 'contractor@sigma.ae', password: 'ContractorSigma#2026', displayName: 'Main Contractor' },
  { role: Role.SUBCONTRACTOR, email: 'subcontractor@sigma.ae', password: 'SubcontractorSigma#2026', displayName: 'Subcontractor' },
  { role: Role.OWNER, email: 'owner@sigma.ae', password: 'OwnerSigma#2026', displayName: 'Asset Owner' },
  { role: Role.OPERATOR, email: 'operator@sigma.ae', password: 'OperatorSigma#2026', displayName: 'Facility Operator' },
  { role: Role.INVESTOR, email: 'investor@sigma.ae', password: 'InvestorSigma#2026', displayName: 'Equity Investor' },
  { role: Role.LENDER, email: 'lender@sigma.ae', password: 'LenderSigma#2026', displayName: 'Financing Bank' },
  { role: Role.PMO, email: 'pmo@sigma.ae', password: 'PmoSigma#2026', displayName: 'PMO Office' },
  { role: Role.GOVERNANCE_BOARD, email: 'board@sigma.ae', password: 'BoardSigma#2026', displayName: 'Governance Board' },
  { role: Role.BANK, email: 'bank@sigma.ae', password: 'BankSigma#2026', displayName: 'Financing Bank' },
  { role: Role.GOVERNMENT_REGULATOR, email: 'regulator@sigma.ae', password: 'RegulatorSigma#2026', displayName: 'Government Regulator' },
  { role: Role.ASSET_MANAGER, email: 'assetmgr@sigma.ae', password: 'AssetMgrSigma#2026', displayName: 'Asset Manager' },
];

/**
 * First-boot demo seeder. When `SEED_DEMO=true` it ensures a default company +
 * the 15 demo role accounts exist (idempotent — creates when absent, refreshes
 * the password/role/company otherwise) so the login user-picker works on a
 * brand-new production database. Runs AFTER migrations (which build the schema
 * during the TypeORM connection), and never crashes startup on failure.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly auth: AuthService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if ((process.env.SEED_DEMO ?? '').toLowerCase() !== 'true') return;
    try {
      await this.ensureDefaultCompany();
      let created = 0;
      let refreshed = 0;
      for (const acct of DEMO_USERS) {
        const { hash, salt } = this.auth.hashPassword(acct.password);
        const existing = await this.users.findOne({ where: { email: acct.email } });
        if (existing) {
          existing.passwordHash = hash;
          existing.passwordSalt = salt;
          existing.role = acct.role;
          existing.active = true;
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
              companyId: DEFAULT_COMPANY_ID,
            }),
          );
          created++;
        }
      }
      this.logger.log(`Demo seed complete: ${created} created, ${refreshed} refreshed (company=${DEFAULT_COMPANY_ID}).`);
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
