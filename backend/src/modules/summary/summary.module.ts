import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SiteEvidence } from '../canonical/entities';
import { CanonicalModule } from '../canonical/canonical.module';
import { ClaudeModule } from '../claude/claude.module';
import { Communication } from '../communications/communication.entity';
import { RulesModule } from '../rules/rules.module';
import { SourcesModule } from '../sources/sources.module';
import { LlmService } from './llm.service';
import { MonthlyReportController } from './monthly-report.controller';
import { MonthlyReportService } from './monthly-report.service';
import { PdfRendererService } from './pdf-renderer.service';
import { SummaryController } from './summary.controller';
import { SummaryService } from './summary.service';

/**
 * Reporting module (Layer 4).
 *
 * Wave 1: Weekly `ExecutiveSummary` (deterministic + optional rewrite via
 * `LlmService`).
 *
 * Wave 2 additions (post-meeting plan §3.6, §5):
 *  - `MonthlyReportService` — three-audience monthly narrative builder.
 *  - `PdfRendererService` — basic pdf-lib renderer (Wave 3 swaps in an
 *    Arabic-capable font + full RTL shaping).
 *  - `ClaudeModule` import so the monthly authoring path can call the
 *    `report-narrator-arabic` persona via `ClaudeService`.
 *  - `SourcesModule` import so the citation guard can validate
 *    `[SOURCE: id]` markers against the curated registry.
 *
 * The weekly path is left unchanged — its `LlmService`-based prose
 * rewrite stays the lighter-touch option, while Wave 2's monthly path is
 * the persona-mediated, audit-trail-heavy artefact Al Ayham asked for.
 */
@Module({
  imports: [CanonicalModule, RulesModule, ClaudeModule, SourcesModule, TypeOrmModule.forFeature([Communication, SiteEvidence])],
  controllers: [SummaryController, MonthlyReportController],
  providers: [SummaryService, LlmService, MonthlyReportService, PdfRendererService],
  exports: [SummaryService, MonthlyReportService],
})
export class SummaryModule {}
