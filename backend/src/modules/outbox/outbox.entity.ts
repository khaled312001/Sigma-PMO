import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../common/entities/base.entity';
import { Layer } from '../../common/enums';

/**
 * `outbox_events` — the cross-layer information bus (ADR-0012, Stage 1).
 *
 * The Outbox is the durable, append-only transport that lets the
 * Engineering / Planning / Governance / Reports / Simulation layers exchange
 * notifications across the NestJS-process ↔ Computer-Use-container boundary.
 * The 2026-06-08 post-meeting plan §3.7 explicitly ruled out the in-process
 * `EventEmitter` for this job because Computer Use sessions run in isolated
 * Windows VM containers and an in-memory emitter cannot reach them.
 *
 * Stage 1 contract (locked here, ADR-0013 may extend it):
 *  - **Transactional with the domain write.** Producers MUST insert an
 *    `outbox_events` row in the same TypeORM transaction as the entity
 *    change that produced the event. Either both land or neither lands.
 *  - **Append-only.** `processedAt` is the only column ever updated, and
 *    only by the subscriber service moving an event from pending to done.
 *    Rows are never deleted; archival is a Stage 2+ concern.
 *  - **No payload schema enforcement yet.** `payload` is opaque JSON owned
 *    by the producing module's contract tests; cross-module validation is
 *    Stage 2+ work.
 *
 * What this table deliberately does NOT model in Stage 1 (Wave 1 envelope):
 *  - retry counters, dead-letter routing, leader election among
 *    subscribers, or any priority-chain field — all blocked on
 *    ADR-0013 / Al Ayham open question 1.
 */
@Entity('outbox_events')
@Index('idx_outbox_processed_created', ['processedAt', 'createdAt'])
@Index('idx_outbox_source_layer_created', ['sourceLayer', 'createdAt'])
export class OutboxEvent extends UuidEntity {
  /**
   * Which layer published this event. Stored as the raw enum string value so
   * a layer rename (Stage 2 / ADR-0013 follow-up) is a forward-compatible
   * column read, never a schema break. Validated at the service boundary.
   */
  @Column({ type: 'varchar', length: 32 })
  sourceLayer!: Layer | string;

  /**
   * Reserved prefixes (ADR-0012 §6): `engineering.`, `planning.`,
   * `governance.`, `reports.`, `simulation.`. Per-prefix routing is the
   * subscriber's contract — wildcards are not permitted in Stage 1.
   *
   * The 64-char cap matches the typed-event-name budget the producing modules
   * use (`<layer>.<aggregate>.<verb>`); event-name namespacing further than
   * that becomes payload, not column.
   */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  eventType!: string;

  /** Opaque event body. Schema is owned by the producing module's tests. */
  @Column({ type: 'json' })
  payload!: Record<string, unknown>;

  /**
   * Null while pending; stamped exactly once when a consumer finishes
   * dispatching the event. The append-only rule means no row may be
   * un-processed by clearing this column.
   */
  @Index()
  @Column({ type: 'datetime', precision: 3, nullable: true })
  processedAt!: Date | null;

  /**
   * Free-form tag identifying which subscriber stamped `processedAt`
   * (e.g. `outbox.subscriber` or a Stage 2 worker id). Null while pending;
   * helps trace "who consumed this event?" without joining a separate
   * audit table.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  processedBy!: string | null;

  /**
   * Optional correlation id tying this event back to a higher-level workflow
   * (ingestion run, build job, scenario fork, …). Indexed because
   * cross-layer debugging starts from "show me every event in correlation
   * X". Nullable because not every producer has a meaningful correlation
   * handle yet.
   */
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  correlationId!: string | null;
}
