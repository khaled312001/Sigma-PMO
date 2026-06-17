import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { companyScope } from '../../common/tenant/tenant-context';
import { RequiresCapability } from '../auth/require-capability.decorator';
import { Project } from './entities';
import { ProjectScores, ProjectsScoresService } from './projects-scores.service';

export interface ProjectSummary {
  id: string;
  businessKey: string;
  name: string;
  status: string | null;
  clientName: string | null;
  dataDate: string | null;
}

/** ProjectSummary plus the additive deterministic score bundle (Agent A). */
export type ProjectSummaryWithScores = ProjectSummary & Partial<ProjectScores>;

/**
 * Read-only listing of current canonical projects. Used by the front-end
 * ProjectSwitcher (Phase 6) to replace the hardcoded `PROJECT_KEY = 'P-1000'`
 * literal that was scattered across the UI.
 *
 * The listing is now decorated with a deterministic per-project score bundle
 * (governance / risk / investment / composite + project + portfolio rankings).
 * The original fields are untouched; the scores are purely additive so existing
 * consumers keep working.
 */
@Controller('projects')
export class ProjectsController {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    private readonly scores: ProjectsScoresService,
  ) {}

  @Get()
  @RequiresCapability('canRead')
  async list(): Promise<ProjectSummaryWithScores[]> {
    const rows = await this.projects.find({
      where: { isCurrent: true, ...companyScope() },
      order: { name: 'ASC' },
    });

    // Decorate with scores. A failure here must NOT break the switcher: the
    // base summary is the contract, scores are best-effort.
    let scoreMap: Map<string, ProjectScores>;
    try {
      scoreMap = await this.scores.scoreAll(rows);
    } catch {
      scoreMap = new Map();
    }

    return rows.map((p) => ({
      id: p.id,
      businessKey: p.businessKey,
      name: p.name,
      status: p.status,
      clientName: p.clientName,
      dataDate: p.dataDate,
      ...(scoreMap.get(p.businessKey) ?? {}),
    }));
  }
}
