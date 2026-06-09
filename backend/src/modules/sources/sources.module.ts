import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Source } from './source.entity';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';

/**
 * Source registry — Wave 2 (post-meeting plan §3.3, rule 5).
 *
 * The module owns its own TypeOrm feature registration for `Source` so the
 * entity is not coupled to the canonical module's bootstrapping order. The
 * service is re-exported because downstream feature modules (FIDIC letter
 * drafter, citation auditor, monthly narrative writer) will inject it.
 *
 * `onApplicationBootstrap` runs the idempotent seeder so a fresh DB has a
 * complete catalogue without manual SQL.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Source])],
  controllers: [SourcesController],
  providers: [SourcesService],
  exports: [SourcesService, TypeOrmModule],
})
export class SourcesModule implements OnApplicationBootstrap {
  constructor(private readonly sources: SourcesService) {}

  /** Idempotent: re-runs on every boot but only upserts changed rows. */
  async onApplicationBootstrap(): Promise<void> {
    await this.sources.seedFromCatalogue();
  }
}
