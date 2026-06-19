import { ExecutionContext, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ApiKeyGuard, REQUIRED_CAPABILITY } from './api-key.guard';
import { AuthService } from './auth.service';
import { CapabilitiesService } from './capabilities.service';
import { Role, ROLE_CAPABILITIES } from './roles.enum';

interface FakeUser {
  id: string;
  role: Role;
  active: boolean;
}

function makeContext(headers: Record<string, string | undefined>, capability: keyof (typeof ROLE_CAPABILITIES)[Role] | undefined): { ctx: ExecutionContext; req: Record<string, unknown> } {
  const req: Record<string, unknown> = { headers };
  const ctx = {
    getHandler: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  // Stash capability so the reflector returns it.
  (ctx.getHandler as unknown as { __capability: typeof capability }).__capability = capability;
  return { ctx, req };
}

function makeReflector(capability: ApiKeyGuard['canActivate'] extends (...args: infer A) => infer R ? (Parameters<NonNullable<Reflector['get']>>[0] extends infer K ? string : string) : never): Reflector {
  return { get: () => capability as unknown } as unknown as Reflector;
}

function fakeReflector(capability: string | undefined): Reflector {
  return {
    get: (_key: unknown) => capability,
  } as unknown as Reflector;
}

function fakeAuthService(opts: {
  userCount?: number;
  bootstrapPermitted?: boolean;
  user?: FakeUser | null;
}): AuthService {
  return {
    countUsers: jest.fn().mockResolvedValue(opts.userCount ?? 0),
    isBootstrapPermitted: jest.fn().mockReturnValue(opts.bootstrapPermitted ?? false),
    findActiveByApiKey: jest.fn().mockResolvedValue(opts.user ?? null),
    // Multi-tenant access gate — no-op in the guard unit tests (covered in
    // auth.service.spec); resolves so canActivate proceeds past the gate.
    assertCompanyActive: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuthService;
}


/** A CapabilitiesService whose effective matrix mirrors the hardcoded defaults. */
function fakeCapabilities(): CapabilitiesService {
  return {
    can: (role: string, capability: string) =>
      !!(ROLE_CAPABILITIES[role as Role] as Record<string, boolean> | undefined)?.[capability],
  } as unknown as CapabilitiesService;
}

describe('ApiKeyGuard', () => {
  it('passes through routes with no required capability', async () => {
    const guard = new ApiKeyGuard(fakeReflector(undefined), fakeAuthService({}), fakeCapabilities());
    const { ctx } = makeContext({}, undefined);
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('allows bootstrap mode when permitted (non-production)', async () => {
    const guard = new ApiKeyGuard(fakeReflector('canIngest'), fakeAuthService({
      userCount: 0,
      bootstrapPermitted: true,
    }), fakeCapabilities());
    const { ctx } = makeContext({}, 'canIngest');
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('throws 503 in bootstrap mode when not permitted (production without token)', async () => {
    const guard = new ApiKeyGuard(fakeReflector('canIngest'), fakeAuthService({
      userCount: 0,
      bootstrapPermitted: false,
    }), fakeCapabilities());
    const { ctx } = makeContext({}, 'canIngest');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects requests without x-api-key once users exist', async () => {
    const guard = new ApiKeyGuard(fakeReflector('canIngest'), fakeAuthService({ userCount: 1 }), fakeCapabilities());
    const { ctx } = makeContext({}, 'canIngest');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects unknown keys', async () => {
    const guard = new ApiKeyGuard(fakeReflector('canIngest'), fakeAuthService({ userCount: 1, user: null }), fakeCapabilities());
    const { ctx } = makeContext({ 'x-api-key': 'sk_bogus' }, 'canIngest');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects valid keys whose role lacks the capability', async () => {
    const guard = new ApiKeyGuard(fakeReflector('canEditPolicy'), fakeAuthService({
      userCount: 1,
      user: { id: 'u1', role: Role.CONTRACTOR, active: true },
    }), fakeCapabilities());
    const { ctx } = makeContext({ 'x-api-key': 'sk_ok' }, 'canEditPolicy');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows valid keys whose role grants the capability', async () => {
    // Plan §7 flipped consultant canIngest to false — the consultant's
    // remaining grant set is read/propose/simulate, so the positive-path
    // assertion now rides canEvaluateRules.
    const guard = new ApiKeyGuard(fakeReflector('canEvaluateRules'), fakeAuthService({
      userCount: 1,
      user: { id: 'u1', role: Role.CONSULTANT, active: true },
    }), fakeCapabilities());
    const { ctx, req } = makeContext({ 'x-api-key': 'sk_ok' }, 'canEvaluateRules');
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(req.user).toBeDefined();
  });

  // Silence the unused-symbol warnings while keeping helpers documented.
  it.skip('typing-only helper', () => {
    void REQUIRED_CAPABILITY;
    void makeReflector;
  });
});
