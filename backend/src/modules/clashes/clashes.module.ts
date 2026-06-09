import { Module } from '@nestjs/common';

import { BoqModule } from '../boq/boq.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { ClaudeModule } from '../claude/claude.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ClashIngestionService } from './clash-ingestion.service';
import { ClashSolutionProposer } from './clash-solution-proposer.service';
import { ClashSolutionProposerController } from './clash-solution-proposer.controller';
import { ClashesController } from './clashes.controller';
import { ClashExcelParser } from './parsers/clash-excel.parser';

/**
 * Layer 1 (Engineering) clash module — post-meeting plan §3.7, ADR-0012 §5.
 *
 * Wave 2 surfaces:
 *
 *  - **Ingestion side** (`ClashIngestionService` + `ClashesController`) —
 *    Navisworks / Revit Excel exports → `ClashItem` rows + one
 *    `engineering.clash.ingested` event per row on the cross-layer Outbox.
 *
 *  - **AI-advisory side** (`ClashSolutionProposer` +
 *    `ClashSolutionProposerController`) — the BIM clash analyst persona
 *    (`revit-clash-analyst`, ADR-0010) is called for one clash at a time
 *    via `POST /clashes/:id/propose`. The service writes the three options
 *    onto `ClashItem.proposedOptions` and pushes
 *    `engineering.clash.options.proposed` onto the outbox. When
 *    `ClaudeService.isEnabled()` is false (no `ANTHROPIC_API_KEY`) the
 *    service falls back to deterministic placeholder options labelled
 *    "AI offline — operator must propose" — see the service doc for the
 *    full safety contract.
 *
 * Why the two surfaces share one module (post-meeting plan §3.7, ADR-0010):
 *  - Both operate on `ClashItem` — co-locating them keeps the persistence
 *    surface single-owner.
 *  - The proposer's only NEW imports are `ClaudeModule` + `BoqModule` — the
 *    inserted dependency cost is minimal, and the test surface gates Claude
 *    behind the same `isEnabled()` switch the rest of the platform uses.
 *
 * Imports:
 *  - `CanonicalModule` for the `ClashItem` + `BoqItem` repositories.
 *  - `OutboxModule` for the cross-layer event bus.
 *  - `ClaudeModule` for the persona binding the proposer relies on.
 *  - `BoqModule` for the BoQ slice the persona cites (the only legal
 *    source of AED numbers per `revit-clash-analyst` rule 1).
 */
@Module({
  imports: [CanonicalModule, OutboxModule, ClaudeModule, BoqModule],
  controllers: [ClashesController, ClashSolutionProposerController],
  providers: [ClashIngestionService, ClashExcelParser, ClashSolutionProposer],
  exports: [ClashIngestionService, ClashSolutionProposer],
})
export class ClashesModule {}
