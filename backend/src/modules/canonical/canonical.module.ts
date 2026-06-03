import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CANONICAL_ENTITIES } from './entities';
import { ProjectsController } from './projects.controller';

/**
 * Registers the canonical data-model repositories and re-exports TypeOrmModule
 * so any feature module (ingestion, rules, reporting) can inject them.
 * Also exposes a read-only `/projects` endpoint for the front-end switcher.
 */
@Module({
  imports: [TypeOrmModule.forFeature(CANONICAL_ENTITIES)],
  controllers: [ProjectsController],
  exports: [TypeOrmModule],
})
export class CanonicalModule {}
