import { Controller, Get, Param } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { Source } from './source.entity';
import { SourcesService } from './sources.service';

/**
 * Read-only catalogue surface. All routes require `canRead` — every
 * authenticated role can browse the source list because reading what the
 * platform's personas are *allowed* to cite is itself an audit affordance.
 *
 * Writes (curator-side edits) are deliberately not exposed here in Wave 2.
 * The catalogue evolves via `sources.seed.json` + a reboot; the seeder
 * upserts on `externalId` so the operator workflow stays "PR + restart".
 */
@Controller('sources')
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Get()
  @RequiresCapability('canRead')
  list(): Promise<Source[]> {
    return this.sources.listAll();
  }

  /**
   * Lookup order:
   *  1. Try as `externalId` (the human-friendly slug like `fidic-red-2017`).
   *  2. Fall back to UUID primary key.
   * Both surfaces are read-only, so collisions are not a concern — the
   * externalId column is unique-indexed at the DB level.
   */
  @Get(':id')
  @RequiresCapability('canRead')
  async byId(@Param('id') id: string): Promise<Source> {
    // externalId never contains a hyphen-followed-by-12-hex pattern that
    // would collide with a UUID, so try slug first.
    try {
      return await this.sources.findByExternalId(id);
    } catch {
      return this.sources.findById(id);
    }
  }

  @Get('by-family/:family')
  @RequiresCapability('canRead')
  byFamily(@Param('family') family: string): Promise<Source[]> {
    return this.sources.findByFamily(family);
  }
}
