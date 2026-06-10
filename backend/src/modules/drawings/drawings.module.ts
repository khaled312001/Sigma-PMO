import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { DrawingsController } from './drawings.controller';
import { DrawingsService } from './drawings.service';

/**
 * Phase-1 drawings ingestion (correction-plan §2.1/§2.7). PDF sets archive
 * immutably + extract features; the drawing-driven baseline path reads the
 * `DrawingPackage.summary` to brief the planner persona. IFC (phase 2) and
 * DWG/RVT (phase 3) extend the same module.
 */
@Module({
  imports: [CanonicalModule, IngestionModule],
  controllers: [DrawingsController],
  providers: [DrawingsService],
  exports: [DrawingsService],
})
export class DrawingsModule {}
