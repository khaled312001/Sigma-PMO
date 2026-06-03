import { Repository } from 'typeorm';

import { GovernancePolicy } from '../canonical/entities';
import { DEFAULT_GOVERNANCE_POLICY } from './default-policy';
import { GovernancePolicyService } from './governance-policy.service';

function makeRepo(): { findOne: jest.Mock; save: jest.Mock; create: jest.Mock; find: jest.Mock } {
  return {
    findOne: jest.fn(),
    save: jest.fn(async (e) => e),
    create: jest.fn((e) => e),
    find: jest.fn(),
  };
}

describe('GovernancePolicyService', () => {
  let repo: ReturnType<typeof makeRepo>;
  let service: GovernancePolicyService;

  beforeEach(() => {
    repo = makeRepo();
    service = new GovernancePolicyService(repo as unknown as Repository<GovernancePolicy>);
  });

  it('upsert with no prior creates v1 and isCurrent=true', async () => {
    repo.findOne.mockResolvedValueOnce(null);
    const next = await service.upsert(null, DEFAULT_GOVERNANCE_POLICY, 'tester');
    expect(next.version).toBe(1);
    expect(next.isCurrent).toBe(true);
    expect(next.authoredBy).toBe('tester');
  });

  it('upsert with prior bumps version and retires the prior row', async () => {
    const prior = { id: 'p1', version: 3, isCurrent: true } as GovernancePolicy;
    repo.findOne.mockResolvedValueOnce(prior);
    const next = await service.upsert(null, { foo: 'bar' }, 'tester');
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', isCurrent: false }));
    expect(next.version).toBe(4);
    expect(next.isCurrent).toBe(true);
  });

  it('resolveFor returns project-scoped current row when present', async () => {
    const specific = { id: 'p-specific' } as GovernancePolicy;
    repo.findOne.mockResolvedValueOnce(specific);
    expect(await service.resolveFor('P-1000')).toBe(specific);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { projectKey: 'P-1000', isCurrent: true } });
  });

  it('resolveFor falls back to global default when no project-scoped row exists', async () => {
    const globalPolicy = { id: 'global' } as GovernancePolicy;
    repo.findOne
      .mockResolvedValueOnce(null)       // project-scoped lookup
      .mockResolvedValueOnce(globalPolicy); // global fallback
    expect(await service.resolveFor('P-1000')).toBe(globalPolicy);
  });

  it('resolveFor seeds the DEFAULT_GOVERNANCE_POLICY on first boot', async () => {
    repo.findOne.mockResolvedValue(null);
    const next = await service.resolveFor(null);
    expect(next.config).toBe(DEFAULT_GOVERNANCE_POLICY);
    expect(next.authoredBy).toBe('system');
  });
});
