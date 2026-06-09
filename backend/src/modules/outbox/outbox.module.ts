import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OutboxEvent } from './outbox.entity';
import { OutboxService } from './outbox.service';

/**
 * Cross-layer Outbox (ADR-0012, Stage 1).
 *
 * Owns the `outbox_events` table and the single producer/consumer surface
 * (`OutboxService`). Wired into `AppModule` so any feature module can
 * inject `OutboxService` and emit cross-layer notifications from inside its
 * own transaction.
 *
 * Stage 1 does not start a polling timer here — the consumer module wires
 * its own scheduler around `OutboxService.poll()` (so this module stays a
 * pure transport with no opinion on cadence). The polling-timer wiring is
 * Stage 2 (ADR-0013) work alongside the priority chain.
 */
@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent])],
  providers: [OutboxService],
  exports: [OutboxService, TypeOrmModule],
})
export class OutboxModule {}
