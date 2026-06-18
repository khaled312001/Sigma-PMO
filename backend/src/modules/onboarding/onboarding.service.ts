import { randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Company, CompanyType, COMPANY_TYPES } from '../canonical/entities/company.entity';
import { Subscription, SupportRequest, User } from '../canonical/entities';
import { SupportKind } from '../canonical/entities/support-request.entity';
import { AuthService } from '../auth/auth.service';
import { Role } from '../auth/roles.enum';
import { StripeService } from '../billing/stripe.service';
import { planFor } from '../billing/plans';
import { COMPANY_PRESETS, presetFor, slugifyCompany } from './company-presets';

export interface RegisterCompanyDto {
  companyName: string;
  companyType: CompanyType;
  country?: string | null;
  ownerEmail: string;
  ownerDisplayName: string;
  ownerPassword: string;
}

export interface AddCompanyUserDto {
  email: string;
  displayName: string;
  role: string;
  password: string;
  projectScopes?: string;
}

@Injectable()
export class OnboardingService {
  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(SupportRequest) private readonly requests: Repository<SupportRequest>,
    private readonly auth: AuthService,
    private readonly stripe: StripeService,
  ) {}

  /** Public catalog of construction-entity company types for the register UI. */
  listTypes() {
    return COMPANY_TYPES.map((t) => {
      const p = COMPANY_PRESETS[t];
      return { type: t, labelEn: p.labelEn, labelAr: p.labelAr, ownerRole: p.ownerRole, allowedRoles: p.allowedRoles };
    });
  }

  /**
   * Company self-registration: create the Company (tenant) + its first owner
   * user (role mapped from the company type), and issue the owner an API key.
   */
  async register(dto: RegisterCompanyDto): Promise<{
    apiKey: string;
    company: { id: string; slug: string; name: string; companyType: CompanyType; status: string; plan: string };
    user: { id: string; email: string; displayName: string; role: Role };
    /** Hosted Stripe Checkout URL (trial); null when billing is not configured. */
    checkoutUrl: string | null;
    billingEnabled: boolean;
  }> {
    const name = dto.companyName?.trim();
    const email = dto.ownerEmail?.trim().toLowerCase();
    if (!name) throw new BadRequestException('companyName is required');
    if (!COMPANY_TYPES.includes(dto.companyType)) {
      throw new BadRequestException(`companyType must be one of: ${COMPANY_TYPES.join(', ')}`);
    }
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new BadRequestException('A valid ownerEmail is required');
    }
    if (!dto.ownerDisplayName?.trim()) throw new BadRequestException('ownerDisplayName is required');
    if (!dto.ownerPassword || dto.ownerPassword.length < 8) {
      throw new BadRequestException('ownerPassword must be at least 8 characters');
    }
    if (await this.users.findOne({ where: { email } })) {
      throw new ConflictException(`A user with email "${email}" already exists`);
    }

    const preset = presetFor(dto.companyType);
    const slug = await this.uniqueSlug(slugifyCompany(name));

    const company = await this.companies.save(
      this.companies.create({
        slug,
        name,
        companyType: dto.companyType,
        status: 'trial',
        plan: 'trial',
        ownerEmail: email,
        country: dto.country?.trim().toUpperCase() || null,
      }),
    );

    const rawKey = `sk_${randomBytes(24).toString('hex')}`;
    const { hash, salt } = this.auth.hashPassword(dto.ownerPassword);
    const owner = await this.users.save(
      this.users.create({
        companyId: company.id,
        email,
        displayName: dto.ownerDisplayName.trim(),
        role: preset.ownerRole,
        apiKeyHash: this.auth.hashApiKey(rawKey),
        passwordHash: hash,
        passwordSalt: salt,
        projectScopes: '*',
        emiratesId: null,
        active: true,
        activityScope: null,
      }),
    );

    company.createdById = owner.id;
    await this.companies.save(company);

    // Trial subscription for the new company (super-admin can manage it later).
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 30);
    await this.subs.save(
      this.subs.create({
        companyId: company.id,
        plan: 'trial',
        status: 'trial',
        seats: 1,
        mrr: '0',
        trialEndsAt,
      }),
    );

    // SaaS billing: send the owner to Stripe Checkout (30-day trial, card on
    // file, charged automatically after the trial). null when Stripe is not
    // configured — the frontend then routes straight to the company login.
    const checkoutUrl = await this.stripe.createCheckoutUrl(company, email);

    return {
      apiKey: rawKey,
      company: { id: company.id, slug: company.slug, name: company.name, companyType: company.companyType, status: company.status, plan: company.plan },
      user: { id: owner.id, email: owner.email, displayName: owner.displayName, role: owner.role },
      checkoutUrl,
      billingEnabled: this.stripe.isEnabled(),
    };
  }

  /** Public (unauthenticated) company branding for the company login page. */
  async publicCompany(slug: string): Promise<Pick<Company, 'slug' | 'name' | 'companyType' | 'status' | 'logoKey'> | null> {
    const c = await this.companies.findOne({ where: { slug } });
    if (!c) return null;
    return { slug: c.slug, name: c.name, companyType: c.companyType, status: c.status, logoKey: c.logoKey };
  }

  /** The caller's own company (for /auth/me enrichment + the company page). */
  async companyFor(user: Pick<User, 'companyId'>): Promise<Company | null> {
    if (!user.companyId) return null;
    return this.companies.findOne({ where: { id: user.companyId } });
  }

  /** Users within the caller's company (company-scoped roster). */
  async listCompanyUsers(caller: User) {
    if (!caller.companyId) throw new ForbiddenException('Caller is not scoped to a company');
    const company = await this.companies.findOne({ where: { id: caller.companyId } });
    const rows = await this.users.find({ where: { companyId: caller.companyId }, order: { createdAt: 'DESC' } });
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      projectScopes: u.projectScopes,
      active: u.active,
      isOwner: u.id === company?.createdById,
      createdAt: u.createdAt,
    }));
  }

  /**
   * The company owner adds a user to their own company. Authorized by company
   * ownership (caller is the registrant). The new user's role must be one the
   * company type allows.
   */
  async addUser(caller: User, dto: AddCompanyUserDto): Promise<{ id: string; apiKey: string }> {
    if (!caller.companyId) throw new ForbiddenException('Caller is not scoped to a company');
    const company = await this.companies.findOne({ where: { id: caller.companyId } });
    if (!company) throw new NotFoundException('Company not found');
    if (company.createdById !== caller.id) {
      throw new ForbiddenException('Only the company owner can add users');
    }

    // Seat limit: a company can only have as many users as its plan allows.
    const plan = planFor(company.plan);
    const seatsUsed = await this.users.count({ where: { companyId: caller.companyId } });
    if (seatsUsed >= plan.seats) {
      throw new ForbiddenException(
        `Seat limit reached for the ${plan.name} plan (${plan.seats} seats). Upgrade your plan to add more users.`,
      );
    }

    const email = dto.email?.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestException('A valid email is required');
    if (!dto.displayName?.trim()) throw new BadRequestException('displayName is required');
    if (!dto.password || dto.password.length < 8) throw new BadRequestException('password must be at least 8 characters');

    const preset = presetFor(company.companyType);
    if (!preset.allowedRoles.includes(dto.role as Role)) {
      throw new BadRequestException(
        `role must be one of: ${preset.allowedRoles.join(', ')} for a ${company.companyType} company`,
      );
    }
    if (await this.users.findOne({ where: { email } })) {
      throw new ConflictException(`A user with email "${email}" already exists`);
    }

    const rawKey = `sk_${randomBytes(24).toString('hex')}`;
    const { hash, salt } = this.auth.hashPassword(dto.password);
    const saved = await this.users.save(
      this.users.create({
        companyId: caller.companyId,
        email,
        displayName: dto.displayName.trim(),
        role: dto.role as Role,
        apiKeyHash: this.auth.hashApiKey(rawKey),
        passwordHash: hash,
        passwordSalt: salt,
        projectScopes: dto.projectScopes?.trim() || '*',
        emiratesId: null,
        active: true,
        activityScope: null,
      }),
    );
    return { id: saved.id, apiKey: rawKey };
  }

  /** A company user raises a support / request ticket to the platform. */
  async createSupport(caller: User, dto: { kind?: SupportKind; subject: string; body?: string }) {
    if (!caller.companyId) throw new ForbiddenException('Caller is not scoped to a company');
    if (!dto.subject?.trim()) throw new BadRequestException('subject is required');
    const saved = await this.requests.save(
      this.requests.create({
        companyId: caller.companyId,
        kind: dto.kind ?? 'support',
        subject: dto.subject.trim(),
        body: dto.body?.trim() || null,
        status: 'open',
        createdByEmail: caller.email,
        reply: null,
      }),
    );
    return { id: saved.id, status: saved.status };
  }

  /** The caller's company's own support/request tickets. */
  async listMySupport(caller: User) {
    if (!caller.companyId) throw new ForbiddenException('Caller is not scoped to a company');
    return this.requests.find({ where: { companyId: caller.companyId }, order: { createdAt: 'DESC' } });
  }

  private async uniqueSlug(base: string): Promise<string> {
    let slug = base;
    for (let i = 0; i < 5; i += 1) {
      if (!(await this.companies.findOne({ where: { slug } }))) return slug;
      slug = `${base}-${randomBytes(2).toString('hex')}`;
    }
    return `${base}-${randomBytes(4).toString('hex')}`;
  }
}
