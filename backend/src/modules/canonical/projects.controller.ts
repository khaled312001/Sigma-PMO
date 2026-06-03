import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Project } from './entities';

export interface ProjectSummary {
  id: string;
  businessKey: string;
  name: string;
  status: string | null;
  clientName: string | null;
  dataDate: string | null;
}

/**
 * Read-only listing of current canonical projects. Used by the front-end
 * ProjectSwitcher (Phase 6) to replace the hardcoded `PROJECT_KEY = 'P-1000'`
 * literal that was scattered across the UI.
 */
@Controller('projects')
export class ProjectsController {
  constructor(@InjectRepository(Project) private readonly projects: Repository<Project>) {}

  @Get()
  async list(): Promise<ProjectSummary[]> {
    const rows = await this.projects.find({
      where: { isCurrent: true },
      order: { name: 'ASC' },
    });
    return rows.map((p) => ({
      id: p.id,
      businessKey: p.businessKey,
      name: p.name,
      status: p.status,
      clientName: p.clientName,
      dataDate: p.dataDate,
    }));
  }
}
