import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request tenant context (multi-tenant SaaS). A middleware opens an
 * AsyncLocalStorage store for every request; the ApiKeyGuard fills in the
 * authenticated caller's `companyId`. Data services then scope their queries to
 * the current company via `companyScope()` and stamp writes via
 * `currentCompanyId()`, so a company only ever sees its OWN records.
 *
 * When `companyId` is null (unauthenticated routes, scripts/cron with no request,
 * or legacy single-tenant callers) the scope is empty — nothing is filtered —
 * which keeps the platform + tests working unchanged.
 */
export interface TenantStore {
  companyId: string | null;
}

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

/** The current request's company id (null when unscoped). */
export function currentCompanyId(): string | null {
  return tenantStorage.getStore()?.companyId ?? null;
}

/** Set the current request's company id (called by the auth guard). */
export function setCurrentCompanyId(companyId: string | null): void {
  const store = tenantStorage.getStore();
  if (store) store.companyId = companyId;
}

/**
 * TypeORM `where`-fragment that scopes to the caller's company. Empty object
 * when unscoped (companyId null) so it can always be spread into a where clause:
 *   `where: { isCurrent: true, ...companyScope() }`
 */
export function companyScope(): { companyId?: string } {
  const id = currentCompanyId();
  return id ? { companyId: id } : {};
}
