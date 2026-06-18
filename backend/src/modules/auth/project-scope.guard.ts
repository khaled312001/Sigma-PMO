import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { currentCompanyId } from '../../common/tenant/tenant-context';
import { Project } from '../canonical/entities';

/**
 * Multi-tenant project-ownership gate. A huge number of read endpoints take a
 * `projectKey`/`projectBusinessKey`/`projectId` and serve that project's data
 * (alerts, KPIs, drawings, letters, reports, safety/authority/utility records,
 * baselines, clashes, scenarios, …). Rather than add an ownership check to each
 * of those ~30 services, this single global guard verifies — for ANY request
 * carrying a project key — that the project belongs to the caller's company.
 * A foreign key (e.g. a guessed `P-1000`) is rejected with 403.
 *
 * Runs as an APP_GUARD registered AFTER ApiKeyGuard, so `currentCompanyId()`
 * (set by ApiKeyGuard from the authenticated user) is populated. When there is
 * no company scope (null — public routes, legacy/single-tenant, tests) the
 * guard is a no-op, so nothing pre-SaaS breaks.
 */
@Injectable()
export class ProjectScopeGuard implements CanActivate {
  constructor(@InjectRepository(Project) private readonly projects: Repository<Project>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const cid = currentCompanyId();
    if (!cid) return true; // unscoped → no tenant filtering (public/legacy/tests)

    const req = context.switchToHttp().getRequest<{
      query?: Record<string, unknown>;
      params?: Record<string, unknown>;
    }>();
    const q = req.query ?? {};
    const p = req.params ?? {};

    const key = (q.projectKey ?? q.projectBusinessKey ?? p.projectKey ?? p.projectBusinessKey) as
      | string
      | undefined;
    if (key) {
      const owned = await this.projects.findOne({
        where: { businessKey: String(key), isCurrent: true, companyId: cid },
      });
      if (!owned) throw new ForbiddenException(`Project "${key}" is not in your company`);
      return true;
    }

    const id = (q.projectId ?? p.projectId) as string | undefined;
    if (id) {
      const owned = await this.projects.findOne({ where: { id: String(id), companyId: cid } });
      if (!owned) throw new ForbiddenException('That project is not in your company');
    }
    return true;
  }
}
