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

/**
 * Regression for the 2026-06-28 owner finding: rotating a key / changing a
 * password must invalidate ALL previously issued keys (lost-laptop / old-tab
 * sessions), not leave the last few apiKeyHashes valid.
 */
describe('AuthService — API key revocation', () => {
  function svcWithSave() {
    const users = {
      findOne: jest.fn(),
      save: jest.fn(async (u: User) => u),
      createQueryBuilder: jest.fn(),
    } as unknown as Repository<User>;
    const companies = { findOne: jest.fn() } as unknown as Repository<Company>;
    const subscriptions = { findOne: jest.fn() } as unknown as Repository<Subscription>;
    const config = { get: jest.fn().mockReturnValue({ demoLoginPublic: false }) } as unknown as ConfigService;
    return new AuthService(users, companies, subscriptions, config);
  }

  it('rotateApiKeyExclusive makes the new key the ONLY valid key and purges all prior hashes', async () => {
    const svc = svcWithSave();
    const user = { apiKeyHash: 'old-primary', apiKeyHashes: ['old-primary', 'older-1', 'older-2'] } as unknown as User;
    const rawKey = await svc.rotateApiKeyExclusive(user);
    const newHash = svc.hashApiKey(rawKey);
    expect(user.apiKeyHash).toBe(newHash);
    expect(user.apiKeyHashes).toEqual([newHash]);
    for (const stale of ['old-primary', 'older-1', 'older-2']) {
      expect(user.apiKeyHashes).not.toContain(stale);
    }
  });

  it('revokeAllSessions drops every key down to a single throwaway nobody holds', async () => {
    const svc = svcWithSave();
    const priorHashes = ['old-primary', 'k2', 'k3', 'k4', 'k5'];
    const user = { apiKeyHash: 'old-primary', apiKeyHashes: [...priorHashes] } as unknown as User;
    await svc.revokeAllSessions(user);
    expect(user.apiKeyHashes).toHaveLength(1);
    // the surviving hash is a freshly minted private key, not any prior session
    expect(priorHashes).not.toContain(user.apiKeyHashes![0]);
    expect(user.apiKeyHash).toBe(user.apiKeyHashes![0]);
  });

  it('findActiveByApiKey no longer matches a pre-rotation key', async () => {
    const svc = svcWithSave();
    const rawOld = 'sk_oldsession';
    const user = { active: true } as unknown as User;
    user.apiKeyHash = svc.hashApiKey(rawOld);
    user.apiKeyHashes = [user.apiKeyHash];
    await svc.rotateApiKeyExclusive(user); // user now carries the NEW hash

    const repo = (svc as unknown as { users: Repository<User> }).users;
    (repo.findOne as jest.Mock).mockImplementation(async (opts: { where: { apiKeyHash: string } }) =>
      opts.where.apiKeyHash === user.apiKeyHash ? user : null,
    );
    (repo.createQueryBuilder as jest.Mock).mockReturnValue({
      where() { return this; },
      andWhere() { return this; },
      getOne: async () => null,
    });

    expect(await svc.findActiveByApiKey(rawOld)).toBeNull();
  });
});
