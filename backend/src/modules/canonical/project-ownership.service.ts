import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { currentCompanyId } from '../../common/tenant/tenant-context';
import { Project } from './entities';

/**
 * Multi-tenant ownership guard for sub-resources fetched by their OWN id (a
 * letter / drawing / report / estimate / baseline job / clash …). Those entities
 * have no `companyId` of their own but carry a `projectBusinessKey`; once the
 * row is loaded, services call `assertOwns(row.projectBusinessKey)` to confirm
 * the caller's company owns that project before returning/mutating it. The
 * global `ProjectScopeGuard` already covers requests that carry a project key in
 * the query/params; this closes the get-/update-by-sub-resource-id path.
 *
 * No-op when there is no company scope (legacy/public/tests).
 */
@Injectable()
export class ProjectOwnershipService {
  constructor(@InjectRepository(Project) private readonly projects: Repository<Project>) {}

  /** Throw 403 unless the caller's company owns the project with this businessKey. */
  async assertOwns(projectBusinessKey: string | null | undefined): Promise<void> {
    const cid = currentCompanyId();
    if (!cid || !projectBusinessKey) return;
    const owned = await this.projects.findOne({
      where: { businessKey: projectBusinessKey, isCurrent: true, companyId: cid },
    });
    if (!owned) throw new ForbiddenException("That record's project is not in your company");
  }

  /** Boolean variant for callers that prefer to filter rather than throw. */
  async owns(projectBusinessKey: string | null | undefined): Promise<boolean> {
    const cid = currentCompanyId();
    if (!cid) return true;
    if (!projectBusinessKey) return false;
    return !!(await this.projects.findOne({
      where: { businessKey: projectBusinessKey, isCurrent: true, companyId: cid },
    }));
  }
}
