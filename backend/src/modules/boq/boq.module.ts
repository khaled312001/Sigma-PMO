import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { StorageService } from '../ingestion/storage/storage.service';
import { OutboxModule } from '../outbox/outbox.module';
import { BoqIngestionService } from './boq-ingestion.service';
import { BoqController } from './boq.controller';
import { BoqExcelParser } from './parsers/boq-excel.parser';

/**
 * BoQ ingestion (post-meeting plan §3.7 + §3.1).
 *
 * Wave 2 ships:
 *  - the standalone Excel parser (`BoqExcelParser`) — single-sheet BoQ shape
 *    with column aliases for Arabic + English headers,
 *  - the append-only ingestion service that produces `BoQ` + `BoqItem`
 *    rows and pushes a `planning.boq.ingested` event on the cross-layer
 *    Outbox in the same transaction (ADR-0012 §3),
 *  - the REST surface used by the front-end uploader and the BoQ viewer.
 *
 * `StorageService` is re-exposed by the generic ingestion module (file
 * archiver) — we provide it locally so this module stays self-contained
 * and does not pull the full ingestion graph just to get SHA-256 archiving.
 * The provider here is intentionally a fresh instance (the storage layer is
 * stateless beyond the constructor-resolved storage root).
 *
 * Why not under `IngestionModule`: a BoQ is not a schedule, the canonical
 * write target is a different entity pair, and the parser's column
 * vocabulary (currency, item rate, activity ref) has no overlap with the
 * generic project/activity normaliser.
 */
@Module({
  imports: [CanonicalModule, OutboxModule],
  controllers: [BoqController],
  providers: [BoqIngestionService, BoqExcelParser, StorageService],
  exports: [BoqIngestionService],
})
export class BoqModule {}
