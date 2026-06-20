import { AuthorityMatrixEntry } from '../canonical/entities/authority-matrix-entry.entity';
import { AuthorityMatrixService } from './authority-matrix.service';

/**
 * AuthorityMatrixService.check() — the deterministic authorization ladder
 * (Mr. Ayham acceptance #10). We stub the repository's list() output.
 */
describe('AuthorityMatrixService.check', () => {
  function svcWith(entries: Partial<AuthorityMatrixEntry>[]): AuthorityMatrixService {
    const repo = { find: async () => entries as AuthorityMatrixEntry[] } as never;
    return new AuthorityMatrixService(repo);
  }

  const engineer: Partial<AuthorityMatrixEntry> = {
    businessKey: 'AUTH-001', projectBusinessKey: 'P1', party: 'engineer', personName: 'Eng. A',
    personEmail: 'eng@consult.com', actions: ['issue_instruction', 'approve_variation'],
    monetaryLimit: '100000.00', currency: 'AED', status: 'active', isCurrent: true,
  };

  it('returns UNKNOWN when no matrix is defined', async () => {
    const r = await svcWith([]).check({ projectKey: 'P1', action: 'issue_instruction', senderEmail: 'x@y.com' });
    expect(r.status).toBe('unknown');
    expect(r.authorized).toBe(false);
  });

  it('authorizes a listed representative for a permitted action', async () => {
    const r = await svcWith([engineer]).check({ projectKey: 'P1', action: 'issue_instruction', senderEmail: 'eng@consult.com' });
    expect(r.status).toBe('authorized');
    expect(r.authorized).toBe(true);
    expect(r.matchedPerson).toBe('Eng. A');
  });

  it('flags an UNAUTHORIZED issuer with the contractual effect', async () => {
    const r = await svcWith([engineer]).check({ projectKey: 'P1', action: 'issue_instruction', senderEmail: 'random@nobody.com' });
    expect(r.status).toBe('unauthorized');
    expect(r.authorized).toBe(false);
    expect(r.contractualEffect).toMatch(/ineffective|invalid|ratified/i);
  });

  it('rejects an instruction over the monetary limit', async () => {
    const r = await svcWith([engineer]).check({ projectKey: 'P1', action: 'approve_variation', senderEmail: 'eng@consult.com', amount: 250000 });
    expect(r.status).toBe('unauthorized');
    expect(r.basis).toMatch(/amount exceeds/i);
  });

  it('honours an action the representative does not hold', async () => {
    const r = await svcWith([engineer]).check({ projectKey: 'P1', action: 'certify_payment', senderEmail: 'eng@consult.com' });
    expect(r.status).toBe('unauthorized');
  });
});
