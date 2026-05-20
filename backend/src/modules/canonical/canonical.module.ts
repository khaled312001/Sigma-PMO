import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CANONICAL_ENTITIES } from './entities';

/**
 * Registers the canonical data-model repositories and re-exports TypeOrmModule
 * so any feature module (ingestion, rules, reporting) can inject them.
 */
@Module({
  imports: [TypeOrmModule.forFeature(CANONICAL_ENTITIES)],
  exports: [TypeOrmModule],
})
export class CanonicalModule {}
