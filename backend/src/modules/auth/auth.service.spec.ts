import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

import { Company } from '../canonical/entities/company.entity';
import { Subscription } from '../canonical/entities/subscription.entity';
import { User } from '../canonical/entities/user.entity';
import { AuthService } from './auth.service';
import { Role } from './roles.enum';

/**
 * Unit coverage for the multi-tenant access enforcement added 2026-06-19:
 *  - demo (sample) accounts are refused when DEMO_LOGIN_PUBLIC=false;
 *  - a suspended/cancelled company or an expired trial is blocked (403).
 */
function makeService(opts: {
  demoLoginPublic?: boolean;
  user?: Partial<User> | null;
  company?: Partial<Company> | null;
  subscription?: Partial<Subscription> | null;
}) {
  const users = {
    findOne: jest.fn().mockResolvedValue(opts.user ?? null),
  } as unknown as Repository<User>;
  const companies = {
    findOne: jest.fn().mockResolvedValue(opts.company ?? null),
  } as unknown as Repository<Company>;
  const subscriptions = {
    findOne: jest.fn().mockResolvedValue(opts.subscription ?? null),
  } as unknown as Repository<Subscription>;
  const config = {
    get: jest.fn().mockReturnValue({ demoLoginPublic: opts.demoLoginPublic ?? false }),
  } as unknown as ConfigService;
  return new AuthService(users, companies, subscriptions, config);
}

describe('AuthService — multi-tenant access enforcement', () => {
  describe('demo-login kill-switch', () => {
    it('refuses a demo account when DEMO_LOGIN_PUBLIC=false', async () => {
      const svc = makeService({ demoLoginPublic: false });
      const { hash, salt } = svc.hashPassword('Sigma$Demo2026');
      const user = { email: 'client@sigma.ae', active: true, isDemo: true, passwordHash: hash, passwordSalt: salt } as User;
      (svc as unknown as { users: Repository<User> }).users.findOne = jest.fn().mockResolvedValue(user);

      const result = await svc.authenticateByPassword('client@sigma.ae', 'Sigma$Demo2026');
      expect(result).toBeNull();
    });

    it('allows a demo account when DEMO_LOGIN_PUBLIC=true', async () => {
      const svc = makeService({ demoLoginPublic: true });
      const { hash, salt } = svc.hashPassword('Sigma$Demo2026');
      const user = { email: 'client@sigma.ae', active: true, isDemo: true, passwordHash: hash, passwordSalt: salt } as User;
      (svc as unknown as { users: Repository<User> }).users.findOne = jest.fn().mockResolvedValue(user);

      const result = await svc.authenticateByPassword('client@sigma.ae', 'Sigma$Demo2026');
      expect(result).not.toBeNull();
    });

    it('always allows a real (non-demo) account regardless of the flag', async () => {
      const svc = makeService({ demoLoginPublic: false });
      const { hash, salt } = svc.hashPassword('RealPass123');
      const user = { email: 'owner@acme.com', active: true, isDemo: false, passwordHash: hash, passwordSalt: salt } as User;
      (svc as unknown as { users: Repository<User> }).users.findOne = jest.fn().mockResolvedValue(user);

      const result = await svc.authenticateByPassword('owner@acme.com', 'RealPass123');
      expect(result).not.toBeNull();
    });
  });

  describe('assertCompanyActive', () => {
    it('never gates a platform user (companyId = null)', async () => {
      const svc = makeService({});
      await expect(svc.assertCompanyActive({ companyId: null })).resolves.toBeUndefined();
    });

    it('blocks a suspended company', async () => {
      const svc = makeService({ company: { id: 'c1', status: 'suspended' } });
      await expect(svc.assertCompanyActive({ companyId: 'c1' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('blocks a cancelled company', async () => {
      const svc = makeService({ company: { id: 'c1', status: 'cancelled' } });
      await expect(svc.assertCompanyActive({ companyId: 'c1' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('blocks an expired trial', async () => {
      const past = new Date(Date.now() - 24 * 3600 * 1000);
      const svc = makeService({
        company: { id: 'c1', status: 'trial' },
        subscription: { companyId: 'c1', status: 'trial', trialEndsAt: past },
      });
      await expect(svc.assertCompanyActive({ companyId: 'c1' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows an active company with a live trial', async () => {
      const future = new Date(Date.now() + 24 * 3600 * 1000);
      const svc = makeService({
        company: { id: 'c1', status: 'active' },
        subscription: { companyId: 'c1', status: 'trial', trialEndsAt: future },
      });
      await expect(svc.assertCompanyActive({ companyId: 'c1' })).resolves.toBeUndefined();
    });
  });
});
