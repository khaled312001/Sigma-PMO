import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { Persona } from '../canonical/entities';
import { PersonasService } from './personas.service';
import type { PersonaPatch } from './personas.service';

/**
 * Read endpoints are gated on `canRead` (all authenticated roles).
 * Edits create a new persona version and require `canEditPersonas`
 * (sigma_admin only — ADR-0010 §7).
 */
@Controller('personas')
export class PersonasController {
  constructor(private readonly personas: PersonasService) {}

  @Get()
  @RequiresCapability('canRead')
  list(): Promise<Persona[]> {
    return this.personas.listAll();
  }

  @Get(':slug')
  @RequiresCapability('canRead')
  bySlug(@Param('slug') slug: string): Promise<Persona> {
    return this.personas.findBySlug(slug);
  }

  @Get('by-layer/:layer')
  @RequiresCapability('canRead')
  byLayer(@Param('layer') layer: string): Promise<Persona[]> {
    return this.personas.findByLayer(layer);
  }

  /**
   * Append a new persona version. Body shape mirrors `PersonaPatch`; the
   * server owns `businessKey` / `version` / `isCurrent`.
   */
  @Post(':slug')
  @HttpCode(200)
  @RequiresCapability('canEditPersonas')
  upsert(@Param('slug') slug: string, @Body() body: PersonaPatch): Promise<Persona> {
    return this.personas.upsert(slug, body);
  }
}
