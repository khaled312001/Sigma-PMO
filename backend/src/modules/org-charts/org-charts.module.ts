import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SourceFile } from '../canonical/entities';
import { ClaudeModule } from '../claude/claude.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { LettersModule } from '../letters/letters.module';
import { SourcesModule } from '../sources/sources.module';
import { OrgChartComplianceService } from './org-chart-compliance.service';
import { OrgChartReview } from './org-chart-review.entity';
import { OrgChartsController } from './org-charts.controller';

/**
 * Wave 3 — PMI org-chart compliance module (post-meeting plan §3.5).
 *
 * Sits between the existing ingestion pipeline (we reuse `StorageService` for
 * the immutable archive of the uploaded Excel) and the Layer 3 Letters module
 * (we cascade findings into a FIDIC-style compliance letter draft).
 *
 * The persona itself (pmi-orgchart-analyst) lives under backend/src/personas/
 * and was seeded by PersonasModule during the Wave 1 boot loader.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([OrgChartReview, SourceFile]),
    ClaudeModule,
    SourcesModule,
    LettersModule,
    IngestionModule,
  ],
  controllers: [OrgChartsController],
  providers: [OrgChartComplianceService],
  exports: [OrgChartComplianceService],
})
export class OrgChartsModule {}
