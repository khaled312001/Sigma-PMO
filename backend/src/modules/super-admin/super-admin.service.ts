import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  Company,
  Subscription,
  SupportRequest,
  User,
} from '../canonical/entities';
import { SubscriptionStatus } from '../canonical/entities/subscription.entity';
import { CompanyStatus } from '../canonical/entities/company.entity';
import { SupportStatus } from '../canonical/entities/support-request.entity';

/**
 * Platform SUPER_ADMIN operations — above all companies. Reads/manages every
 * company, their subscriptions and support/requests, and rolls up
 * platform-wide analytics. All gated on `canManagePlatform`.
 */
@Injectable()
export class SuperAdminService {
  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(SupportRequest) private readonly requests: Repository<SupportRequest>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async listCompanies() {
    const rows = await this.companies.find({ order: { createdAt: 'DESC' } });
    return Promise.all(
      rows.map(async (c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        companyType: c.companyType,
        status: c.status,
        plan: c.plan,
        ownerEmail: c.ownerEmail,
        country: c.country,
        createdAt: c.createdAt,
        userCount: await this.users.count({ where: { companyId: c.id } }),
        subscription: await this.subs.findOne({ where: { companyId: c.id } }),
      })),
    );
  }

  async setCompanyStatus(id: string, status: CompanyStatus) {
    const c = await this.companies.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Company not found');
    c.status = status;
    await this.companies.save(c);
    return { ok: true as const };
  }

  async listSubscriptions() {
    const subs = await this.subs.find({ order: { createdAt: 'DESC' } });
    const byCompany = new Map((await this.companies.find()).map((c) => [c.id, c]));
    return subs.map((s) => ({
      ...s,
      companyName: byCompany.get(s.companyId)?.name ?? null,
    }));
  }

  async updateSubscription(
    id: string,
    dto: { plan?: string; status?: SubscriptionStatus; seats?: number; renewsAt?: string | null; mrr?: number },
  ) {
    const s = await this.subs.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Subscription not found');
    if (dto.plan !== undefined) s.plan = dto.plan;
    if (dto.status !== undefined) s.status = dto.status;
    if (dto.seats !== undefined) s.seats = dto.seats;
    if (dto.renewsAt !== undefined) s.renewsAt = dto.renewsAt;
    if (dto.mrr !== undefined) s.mrr = String(dto.mrr);
    await this.subs.save(s);
    return { ok: true as const };
  }

  async listRequests(status?: SupportStatus) {
    const where = status ? { status } : {};
    const rows = await this.requests.find({ where, order: { createdAt: 'DESC' } });
    const byCompany = new Map((await this.companies.find()).map((c) => [c.id, c]));
    return rows.map((r) => ({ ...r, companyName: byCompany.get(r.companyId)?.name ?? null }));
  }

  async updateRequest(id: string, dto: { status?: SupportStatus; reply?: string }) {
    const r = await this.requests.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Request not found');
    if (dto.status !== undefined) r.status = dto.status;
    if (dto.reply !== undefined) r.reply = dto.reply;
    await this.requests.save(r);
    return { ok: true as const };
  }

  /** Platform-wide roll-up for the super-admin dashboard. */
  async analytics() {
    const companies = await this.companies.find();
    const subs = await this.subs.find();
    const statusCount = (s: string) => companies.filter((c) => c.status === s).length;
    const subStatusCount = (s: string) => subs.filter((x) => x.status === s).length;
    return {
      companies: {
        total: companies.length,
        active: statusCount('active'),
        trial: statusCount('trial'),
        suspended: statusCount('suspended'),
        cancelled: statusCount('cancelled'),
        byType: this.groupBy(companies.map((c) => c.companyType)),
      },
      users: await this.users.count(),
      subscriptions: {
        total: subs.length,
        active: subStatusCount('active'),
        trial: subStatusCount('trial'),
        totalMrr: subs.reduce((acc, s) => acc + Number(s.mrr ?? 0), 0),
      },
      openRequests: await this.requests.count({ where: { status: 'open' } }),
    };
  }

  private groupBy(values: string[]): Record<string, number> {
    return values.reduce<Record<string, number>>((acc, v) => {
      acc[v] = (acc[v] ?? 0) + 1;
      return acc;
    }, {});
  }
}
