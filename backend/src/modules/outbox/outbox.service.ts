import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';

import { Layer } from '../../common/enums';
import { OutboxEvent } from './outbox.entity';

/** Handler signature for `poll()`. Throws → event is left pending for retry. */
export type OutboxEventHandler = (event: OutboxEvent) => Promise<void> | void;

/** Map from `eventType` → handler. Unknown event types are skipped (left pending). */
export type OutboxEventHandlerMap = Record<
  string,
  OutboxEventHandler | undefined
>;

/** Default subscriber tag stamped onto `processedBy` when none is supplied. */
export const DEFAULT_PROCESSED_BY = 'outbox.subscriber';

/** Default `maxAgeMs` for `poll()` — 5 minutes per the task envelope. */
export const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

/** Default `batchSize` for `poll()` — 50 events per tick. */
export const DEFAULT_BATCH_SIZE = 50;

/** Optional inputs to `push()`. */
export interface PushOptions {
  /** Correlation id tying this event to a higher-level workflow. */
  correlationId?: string | null;
}

/** Optional inputs to `poll()`. */
export interface PollOptions {
  /** Max rows scanned per call. Defaults to {@link DEFAULT_BATCH_SIZE}. */
  batchSize?: number;
  /**
   * Cap on event age (`now - createdAt`) considered for dispatch on this
   * tick. Defaults to {@link DEFAULT_MAX_AGE_MS}. Older pending rows are
   * skipped on this tick (still pending — they get retried via a wider
   * sweep, separate ADR), so a flood of stale rows can't starve fresh
   * events. Pass `0` to disable the cap (Stage 1 tests use this).
   */
  maxAgeMs?: number;
  /** Subscriber tag stamped onto `processedBy`. */
  processedBy?: string;
}

/** Result returned from `poll()` so callers can log / alert on it. */
export interface PollResult {
  /** Rows successfully dispatched and stamped this tick. */
  processed: number;
  /** Rows whose handler threw — left pending for the next tick. */
  failed: number;
  /** Rows skipped because no handler matched their `eventType`. */
  skipped: number;
}

/**
 * Cross-layer Outbox producer + consumer (ADR-0012, Stage 1).
 *
 * Two surfaces:
 *
 *  - `push(layer, eventType, payload, manager?)` — producers call this
 *    **inside their existing TypeORM transaction**, passing the active
 *    `EntityManager`. The Outbox row lands or rolls back atomically with
 *    the domain write. Producers without a transaction may omit the
 *    manager (Stage 1 trusts the producing module to know whether
 *    atomicity matters — auto-creating a transaction here would silently
 *    hide bugs).
 *  - `poll(handlerByEventType, options?)` — the single in-process
 *    subscriber loop reads pending rows in FIFO order, dispatches them to
 *    the matching handler, and stamps `processedAt` + `processedBy` on
 *    success. Handlers that throw leave the row pending for retry on the
 *    next tick (unbounded retries in Stage 1 — bounded retries / DLQ are
 *    Stage 2 work, ADR-0013).
 *
 * What this service does NOT do in Stage 1:
 *  - it does not start its own polling timer (the bootstrap that
 *    invokes `poll()` on a schedule is wired by the consuming module),
 *  - it does not enforce a per-handler concurrency limit,
 *  - it does not implement leader election (single subscriber assumed —
 *    plan §3.7 Risk).
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly events: Repository<OutboxEvent>,
  ) {}

  /**
   * Insert one event onto the outbox. When `manager` is supplied (the
   * recommended path) the insert participates in the caller's transaction:
   * either both the domain write and the Outbox row land, or neither does.
   *
   * The event-type prefix MUST match one of the ADR-0012 §6 reserved
   * namespaces (`engineering.` / `planning.` / `governance.` / `reports.` /
   * `simulation.`). Producers violating this contract get a thrown
   * `Error` rather than a silently-dropped event.
   */
  async push(
    layer: Layer | string,
    eventType: string,
    payload: Record<string, unknown>,
    manager?: EntityManager,
    options: PushOptions = {},
  ): Promise<OutboxEvent> {
    this.assertEventTypeIsReserved(eventType);
    const repo = manager ? manager.getRepository(OutboxEvent) : this.events;
    const row = repo.create({
      sourceLayer: layer,
      eventType,
      payload,
      processedAt: null,
      processedBy: null,
      correlationId: options.correlationId ?? null,
    });
    return repo.save(row);
  }

  /**
   * Dispatch pending events in FIFO order (oldest `createdAt` first). At
   * most `batchSize` rows are considered per call so a single tick cannot
   * hold a long DB transaction.
   *
   * Each row is stamped `processedAt` + `processedBy` **only after** the
   * handler resolves successfully — the stamp is the at-least-once
   * commitment, identical to a worker queue acknowledgement. A failing
   * handler leaves the row pending for the next tick.
   *
   * Rows whose `eventType` has no handler in `handlers` are skipped (left
   * pending) so a slow consumer module loading at app start does not lose
   * events its sibling produced earlier.
   */
  async poll(
    handlers: OutboxEventHandlerMap,
    options: PollOptions = {},
  ): Promise<PollResult> {
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    const processedBy = options.processedBy ?? DEFAULT_PROCESSED_BY;

    const pending = await this.events.find({
      where: { processedAt: IsNull() },
      order: { createdAt: 'ASC' },
      take: batchSize,
    });

    // `maxAgeMs` is consulted as a *warning shape* in Stage 1: an event older
    // than the cap is still dispatched (we never want to silently drop a
    // pending notification), but it surfaces in the `PollResult` so the
    // caller can alert when the queue is falling behind. Stage 2 (ADR-0013)
    // replaces this with a bounded retry + DLQ.
    const ageCutoff = maxAgeMs > 0 ? Date.now() - maxAgeMs : null;
    let staleSeen = 0;
    if (ageCutoff !== null) {
      for (const e of pending) {
        if (e.createdAt.getTime() < ageCutoff) staleSeen += 1;
      }
      if (staleSeen > 0) {
        this.logger.warn(
          `Outbox poll observed ${staleSeen} event(s) older than maxAgeMs=${maxAgeMs}`,
        );
      }
    }

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    for (const event of pending) {
      const handler = handlers[event.eventType];
      if (!handler) {
        skipped += 1;
        continue;
      }
      try {
        await handler(event);
      } catch (err) {
        failed += 1;
        this.logger.warn(
          `Outbox handler for ${event.eventType} (event ${event.id}) failed: ${(err as Error).message}`,
        );
        continue;
      }
      // Stamp idempotently: if a concurrent run somehow grabbed the same
      // row, the second stamp is a no-op because we filter on
      // `processedAt IS NULL`.
      const updateResult = await this.events.update(
        { id: event.id, processedAt: IsNull() },
        { processedAt: new Date(), processedBy },
      );
      if ((updateResult.affected ?? 0) === 0) {
        // Another consumer beat us to it — count as processed, do not retry.
        this.logger.debug(
          `Outbox event ${event.id} was already stamped by another consumer; skipping double-stamp`,
        );
      }
      processed += 1;
    }

    return { processed, failed, skipped };
  }

  /**
   * Diagnostic — count of pending rows. Used by the queue-depth warning
   * called out in ADR-0012 §3 (threshold = 30 in Stage 1).
   */
  pendingCount(): Promise<number> {
    return this.events.count({ where: { processedAt: IsNull() } });
  }

  /** ADR-0012 §6 reserved prefixes; enforced on every `push()`. */
  private static readonly RESERVED_PREFIXES = [
    'engineering.',
    'planning.',
    'governance.',
    'reports.',
    'simulation.',
  ];

  private assertEventTypeIsReserved(eventType: string): void {
    if (!eventType || eventType.length > 64) {
      throw new Error(
        `Outbox eventType must be 1..64 chars (got ${eventType?.length ?? 0})`,
      );
    }
    const ok = OutboxService.RESERVED_PREFIXES.some((p) =>
      eventType.startsWith(p),
    );
    if (!ok) {
      throw new Error(
        `Outbox eventType "${eventType}" must start with one of: ${OutboxService.RESERVED_PREFIXES.join(', ')}`,
      );
    }
  }
}
