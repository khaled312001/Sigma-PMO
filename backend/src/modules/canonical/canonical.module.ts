import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CANONICAL_ENTITIES } from './entities';
import { ProjectOwnershipService } from './project-ownership.service';
import { ProjectsController } from './projects.controller';
import { ProjectsScoresService } from './projects-scores.service';

/**
 * Registers the canonical data-model repositories and re-exports TypeOrmModule
 * so any feature module (ingestion, rules, reporting) can inject them.
 * Also exposes a read-only `/projects` endpoint for the front-end switcher, and
 * the multi-tenant `ProjectOwnershipService` (sub-resource get/update-by-id guard).
 */
@Module({
  imports: [TypeOrmModule.forFeature(CANONICAL_ENTITIES)],
  controllers: [ProjectsController],
  providers: [ProjectsScoresService, ProjectOwnershipService],
  exports: [TypeOrmModule, ProjectsScoresService, ProjectOwnershipService],
})
export class CanonicalModule {}
