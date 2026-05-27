import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  Activity,
  Project,
  Report,
  Resource,
  ResourceAssignment,
} from '../canonical/entities';
import { ProjectSnapshot } from './types';

/** Loads the current canonical snapshot (`isCurrent = true`) for one project. */
@Injectable()
export class SnapshotService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(ResourceAssignment) private readonly assignments: Repository<ResourceAssignment>,
    @InjectRepository(Report) private readonly reports: Repository<Report>,
  ) {}

  async load(projectId: string): Promise<ProjectSnapshot> {
    const project = await this.projects.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    // Children may have been ingested against earlier project versions (which
    // share this businessKey). Gather every project version's id, then scope
    // current children across all of them — this yields the true latest
    // world state for the business entity, not just the latest run's slice.
    const versions = await this.projects.find({
      where: { businessKey: project.businessKey },
      select: { id: true },
    });
    const projectIds = versions.map((v) => v.id);

    const activities = await this.activities.find({ where: { projectId: In(projectIds), isCurrent: true } });
    const resources = await this.resources.find({ where: { projectId: In(projectIds), isCurrent: true } });
    const reports = await this.reports.find({ where: { projectId: In(projectIds), isCurrent: true } });

    const activityIds = activities.map((a) => a.id);
    const assignments = activityIds.length === 0
      ? []
      : await this.assignments.find({
          where: { activityId: In(activityIds), isCurrent: true },
        });

    return { project, activities, resources, assignments, reports };
  }

  /** All projects whose latest version is current — one snapshot per. */
  async loadAllCurrent(): Promise<ProjectSnapshot[]> {
    const projects = await this.projects.find({ where: { isCurrent: true } });
    return Promise.all(projects.map((p) => this.load(p.id)));
  }
}
