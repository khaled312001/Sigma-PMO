import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ApiKeyGuard } from './api-key.guard';
import { AuthService } from './auth.service';
import { CapabilitiesService } from './capabilities.service';
import { Role, ROLE_CAPABILITIES } from './roles.enum';

/**
 * Per-role permission enforcement (audit 2026-06-28, item #7: "test each role
 * and its permissions from the BACKEND, not the frontend only"). Drives the real
 * ApiKeyGuard + the real ROLE_CAPABILITIES matrix across EVERY role × EVERY
 * capability and asserts the guard allows iff the matrix grants it — so the
 * backend, not just the UI gates, is proven to enforce the matrix.
 */
function ctxFor(role: Role, capability: string): { guard: ApiKeyGuard; ctx: ExecutionContext } {
  const reflector = { get: () => capability } as unknown as Reflector;
  const auth = {
    countUsers: jest.fn().mockResolvedValue(1),
    isBootstrapPermitted: jest.fn().mockReturnValue(false),
    findActiveByApiKey: jest.fn().mockResolvedValue({ id: 'u1', role, active: true, companyId: 'c1' }),
    assertCompanyActive: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuthService;
  const capabilities = {
    can: (r: string, c: string) => !!(ROLE_CAPABILITIES[r as Role] as Record<string, boolean> | undefined)?.[c],
  } as unknown as CapabilitiesService;
  const req: Record<string, unknown> = { headers: { 'x-api-key': 'sk_ok' } };
  const ctx = {
    getHandler: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { guard: new ApiKeyGuard(reflector, auth, capabilities), ctx };
}

describe('Per-role capability enforcement (backend guard × full matrix)', () => {
  const roles = Object.values(Role);
  const capabilities = Array.from(
    new Set(roles.flatMap((r) => Object.keys(ROLE_CAPABILITIES[r] as Record<string, boolean>))),
  );

  it('covers every role and capability', () => {
    expect(roles.length).toBeGreaterThanOrEqual(10);
    expect(capabilities.length).toBeGreaterThanOrEqual(15);
  });

  for (const role of roles) {
    for (const cap of capabilities) {
      const granted = !!(ROLE_CAPABILITIES[role] as Record<string, boolean>)[cap];
      it(`${role} ${granted ? 'CAN' : 'cannot'} ${cap}`, async () => {
        const { guard, ctx } = ctxFor(role, cap);
        if (granted) {
          await expect(guard.canActivate(ctx)).resolves.toBe(true);
        } else {
          await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
        }
      });
    }
  }
});
