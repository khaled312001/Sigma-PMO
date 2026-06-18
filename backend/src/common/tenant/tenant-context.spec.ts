import {
  companyScope,
  currentCompanyId,
  setCurrentCompanyId,
  tenantStorage,
} from './tenant-context';

/**
 * Tenant-context primitives — the foundation of multi-tenant data isolation.
 * If these regress, every `...companyScope()` query silently stops filtering.
 */
describe('tenant-context', () => {
  it('is unscoped (null / empty) outside a request store', () => {
    expect(currentCompanyId()).toBeNull();
    expect(companyScope()).toEqual({});
  });

  it('exposes the company id set within a store', () => {
    tenantStorage.run({ companyId: null }, () => {
      setCurrentCompanyId('co-123');
      expect(currentCompanyId()).toBe('co-123');
      expect(companyScope()).toEqual({ companyId: 'co-123' });
    });
  });

  it('returns an EMPTY scope when companyId is null (legacy/tests unaffected)', () => {
    tenantStorage.run({ companyId: null }, () => {
      expect(companyScope()).toEqual({});
    });
  });

  it('isolates company scope between concurrent stores', async () => {
    const seen: Array<string | null> = [];
    await Promise.all([
      new Promise<void>((resolve) =>
        tenantStorage.run({ companyId: 'co-A' }, () => {
          setImmediate(() => {
            seen.push(currentCompanyId());
            resolve();
          });
        }),
      ),
      new Promise<void>((resolve) =>
        tenantStorage.run({ companyId: 'co-B' }, () => {
          setImmediate(() => {
            seen.push(currentCompanyId());
            resolve();
          });
        }),
      ),
    ]);
    expect(seen.sort()).toEqual(['co-A', 'co-B']);
  });
});
