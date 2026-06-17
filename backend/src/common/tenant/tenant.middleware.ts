import { Injectable, NestMiddleware } from '@nestjs/common';

import { tenantStorage } from './tenant-context';

/**
 * Opens the per-request tenant AsyncLocalStorage store and runs the rest of the
 * pipeline inside it, so the ApiKeyGuard can populate `companyId` and every
 * downstream service can read it. Registered globally for all routes.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(_req: unknown, _res: unknown, next: () => void): void {
    tenantStorage.run({ companyId: null }, () => next());
  }
}
