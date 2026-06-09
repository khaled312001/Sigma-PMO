import { Module, OnApplicationBootstrap } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { PersonasController } from './personas.controller';
import { PersonasService } from './personas.service';

/**
 * Per-page expert persona registry (ADR-0010).
 *
 * Wave 1 wires up the CRUD surface + the disk seeder. The actual Anthropic
 * SDK binding (Wave 2 / C3) and the `/admin/personas` UI (Wave 3) are out
 * of scope here.
 */
@Module({
  imports: [CanonicalModule],
  controllers: [PersonasController],
  providers: [PersonasService],
  exports: [PersonasService],
})
export class PersonasModule implements OnApplicationBootstrap {
  constructor(private readonly personas: PersonasService) {}

  /** Idempotent: re-runs on every boot but only inserts new slugs. */
  async onApplicationBootstrap(): Promise<void> {
    await this.personas.seedFromDisk();
  }
}
