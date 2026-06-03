import { ExecutionContext, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ApiKeyGuard, REQUIRED_CAPABILITY } from './api-key.guard';
import { AuthService } from './auth.service';
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
  } as unknown as AuthService;
}

describe('ApiKeyGuard', () => {
  it('passes through routes with no required capability', async () => {
    const guard = new ApiKeyGuard(fakeReflector(undefined), fakeAuthService({}));
    const { ctx } = makeContext({}, undefined);
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('allows bootstrap mode when permitted (non-production)', async () => {
    const guard = new ApiKeyGuard(fakeReflector('canIngest'), fakeAuthService({
      userCount: 0,
      bootstrapPermitted: true,
    }));
    const { ctx } = makeContext({}, 'canIngest');
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('throws 503 in bootstrap mode when not permitted (production without token)', async () => {
    const guard = new ApiKeyGuard(fakeReflector('canIngest'), fakeAuthService({
      userCount: 0,
      bootstrapPermitted: false,
    }));
    const { ctx } = makeContext({}, 'canIngest');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects requests without x-api-key once users exist', async () => {
    const guard = new ApiKeyGuard(fakeReflector('canIngest'), fakeAuthService({ userCount: 1 }));
    const { ctx } = makeContext({}, 'canIngest');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects unknown keys', async () => {
    const guard = new ApiKeyGuard(fakeReflector('canIngest'), fakeAuthService({ userCount: 1, user: null }));
    const { ctx } = makeContext({ 'x-api-key': 'sk_bogus' }, 'canIngest');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects valid keys whose role lacks the capability', async () => {
    const guard = new ApiKeyGuard(fakeReflector('canEditPolicy'), fakeAuthService({
      userCount: 1,
      user: { id: 'u1', role: Role.CONTRACTOR, active: true },
    }));
    const { ctx } = makeContext({ 'x-api-key': 'sk_ok' }, 'canEditPolicy');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows valid keys whose role grants the capability', async () => {
    const guard = new ApiKeyGuard(fakeReflector('canIngest'), fakeAuthService({
      userCount: 1,
      user: { id: 'u1', role: Role.CONSULTANT, active: true },
    }));
    const { ctx, req } = makeContext({ 'x-api-key': 'sk_ok' }, 'canIngest');
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(req.user).toBeDefined();
  });

  // Silence the unused-symbol warnings while keeping helpers documented.
  it.skip('typing-only helper', () => {
    void REQUIRED_CAPABILITY;
    void makeReflector;
  });
});
