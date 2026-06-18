import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { tenantStorage } from '../../common/tenant/tenant-context';
import { Project } from '../canonical/entities';
import { ProjectScopeGuard } from './project-scope.guard';

function makeContext(query: Record<string, unknown> = {}, params: Record<string, unknown> = {}): ExecutionContext {
  const req = { query, params };
  return {
    getHandler: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

/** A Project repo that "owns" only the given (businessKey|id, companyId) pairs. */
function fakeProjects(owned: Array<{ businessKey?: string; id?: string; companyId: string }>): Repository<Project> {
  return {
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const match = owned.find(
        (o) =>
          o.companyId === where.companyId &&
          (where.businessKey === undefined || o.businessKey === where.businessKey) &&
          (where.id === undefined || o.id === where.id),
      );
      return (match ?? null) as unknown as Project;
    }),
  } as unknown as Repository<Project>;
}

/** Run the guard inside a tenant store so currentCompanyId() is populated. */
async function runGuard(guard: ProjectScopeGuard, ctx: ExecutionContext, companyId: string | null): Promise<boolean> {
  return tenantStorage.run({ companyId }, () => guard.canActivate(ctx));
}

describe('ProjectScopeGuard', () => {
  it('is a no-op when there is no company scope (legacy / public / tests)', async () => {
    const guard = new ProjectScopeGuard(fakeProjects([]));
    await expect(runGuard(guard, makeContext({ projectKey: 'P-1000' }), null)).resolves.toBe(true);
  });

  it('passes through requests that carry no project key', async () => {
    const guard = new ProjectScopeGuard(fakeProjects([]));
    await expect(runGuard(guard, makeContext({ limit: '50' }), 'co-A')).resolves.toBe(true);
  });

  it('allows a projectKey the company owns', async () => {
    const guard = new ProjectScopeGuard(fakeProjects([{ businessKey: 'P-1', companyId: 'co-A' }]));
    await expect(runGuard(guard, makeContext({ projectKey: 'P-1' }), 'co-A')).resolves.toBe(true);
  });

  it('REJECTS (403) a foreign projectKey', async () => {
    const guard = new ProjectScopeGuard(fakeProjects([{ businessKey: 'P-1', companyId: 'co-A' }]));
    await expect(runGuard(guard, makeContext({ projectKey: 'P-1' }), 'co-B')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('REJECTS a guessed seed key (P-1000) for a new company', async () => {
    const guard = new ProjectScopeGuard(fakeProjects([{ businessKey: 'P-1000', companyId: 'default' }]));
    await expect(runGuard(guard, makeContext({ projectKey: 'P-1000' }), 'co-new')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('honors projectBusinessKey + path params + projectId', async () => {
    const guard = new ProjectScopeGuard(
      fakeProjects([{ businessKey: 'P-2', companyId: 'co-A' }, { id: 'uuid-9', companyId: 'co-A' }]),
    );
    await expect(runGuard(guard, makeContext({ projectBusinessKey: 'P-2' }), 'co-A')).resolves.toBe(true);
    await expect(runGuard(guard, makeContext({}, { projectKey: 'P-2' }), 'co-A')).resolves.toBe(true);
    await expect(runGuard(guard, makeContext({ projectId: 'uuid-9' }), 'co-A')).resolves.toBe(true);
    await expect(runGuard(guard, makeContext({ projectId: 'uuid-9' }), 'co-B')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
