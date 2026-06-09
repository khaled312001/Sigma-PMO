import { EntityManager, Repository } from 'typeorm';

import { Layer } from '../../common/enums';
import { OutboxEvent } from './outbox.entity';
import {
  DEFAULT_PROCESSED_BY,
  OutboxService,
  type OutboxEventHandlerMap,
} from './outbox.service';

/**
 * In-memory stand-in for `Repository<OutboxEvent>`. Keeps a list of rows in
 * insertion order so we can assert FIFO ordering and at-most-once stamping
 * without spinning up a real MySQL.
 */
class InMemoryOutboxRepo {
  rows: OutboxEvent[] = [];
  private nextIdCounter = 0;

  create(partial: Partial<OutboxEvent>): OutboxEvent {
    return { ...partial } as OutboxEvent;
  }

  save(row: OutboxEvent): Promise<OutboxEvent> {
    if (!row.id) {
      row.id = `e-${++this.nextIdCounter}`;
    }
    if (!row.createdAt) {
      // 1ms increments so `createdAt ASC` is deterministic regardless of
      // how fast Jest blasts through `save()` calls.
      row.createdAt = new Date(1_700_000_000_000 + this.nextIdCounter);
    }
    const existing = this.rows.findIndex((r) => r.id === row.id);
    if (existing >= 0) {
      this.rows[existing] = { ...this.rows[existing], ...row };
    } else {
      this.rows.push(row);
    }
    return Promise.resolve(row);
  }

  find(query: {
    where: { processedAt?: unknown; createdAt?: unknown };
    order?: { createdAt?: 'ASC' | 'DESC' };
    take?: number;
  }): Promise<OutboxEvent[]> {
    const pendingOnly = query.where.processedAt !== undefined;
    let out = this.rows.slice();
    if (pendingOnly) out = out.filter((r) => r.processedAt === null);
    if (query.order?.createdAt === 'ASC') {
      out = out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }
    if (typeof query.take === 'number') out = out.slice(0, query.take);
    return Promise.resolve(out);
  }

  update(
    where: { id: string; processedAt?: unknown },
    patch: Partial<OutboxEvent>,
  ): Promise<{ affected: number }> {
    const idx = this.rows.findIndex(
      (r) =>
        r.id === where.id &&
        (where.processedAt === undefined || r.processedAt === null),
    );
    if (idx < 0) return Promise.resolve({ affected: 0 });
    this.rows[idx] = { ...this.rows[idx], ...patch };
    return Promise.resolve({ affected: 1 });
  }

  count(query: { where: { processedAt?: unknown } }): Promise<number> {
    if (query.where.processedAt === undefined) {
      return Promise.resolve(this.rows.length);
    }
    return Promise.resolve(
      this.rows.filter((r) => r.processedAt === null).length,
    );
  }
}

function makeService(): { service: OutboxService; repo: InMemoryOutboxRepo } {
  const repo = new InMemoryOutboxRepo();
  const service = new OutboxService(repo as unknown as Repository<OutboxEvent>);
  return { service, repo };
}

describe('OutboxService', () => {
  describe('push', () => {
    it('inserts an unprocessed row with the supplied layer + payload', async () => {
      const { service, repo } = makeService();

      const event = await service.push(
        Layer.ENGINEERING,
        'engineering.clash.ingested',
        { clashId: 'c-1' },
      );

      expect(event.sourceLayer).toBe(Layer.ENGINEERING);
      expect(event.eventType).toBe('engineering.clash.ingested');
      expect(event.payload).toEqual({ clashId: 'c-1' });
      expect(event.processedAt).toBeNull();
      expect(event.processedBy).toBeNull();
      expect(repo.rows).toHaveLength(1);
    });

    it('threads `correlationId` through into the persisted row', async () => {
      const { service, repo } = makeService();

      await service.push(
        Layer.PLANNING,
        'planning.baseline.job.awaiting_approval',
        { jobId: 'j-1' },
        undefined,
        {
          correlationId: '11111111-1111-1111-1111-111111111111',
        },
      );

      expect(repo.rows[0].correlationId).toBe(
        '11111111-1111-1111-1111-111111111111',
      );
    });

    it('rejects event types outside the ADR-0012 §6 reserved prefixes', async () => {
      const { service } = makeService();
      await expect(
        service.push(Layer.ENGINEERING, 'unknown.thing.happened', {}),
      ).rejects.toThrow(/must start with one of/);
    });

    it('rejects event types longer than 64 chars', async () => {
      const { service } = makeService();
      const tooLong = 'engineering.' + 'x'.repeat(60);
      await expect(
        service.push(Layer.ENGINEERING, tooLong, {}),
      ).rejects.toThrow(/1\.\.64 chars/);
    });

    it('participates in the caller transaction when an EntityManager is supplied (atomic with the domain write)', async () => {
      const { service } = makeService();

      // A fake EntityManager that exposes its own repository — the service
      // must use *this* repo, not its injected default one. That is the
      // "atomic with the domain write" contract: both rows live and die
      // under the same transaction handle.
      const txRepo = new InMemoryOutboxRepo();
      const getRepositorySpy = jest.fn().mockReturnValue(txRepo);
      const fakeManager = {
        getRepository: getRepositorySpy,
      } as unknown as EntityManager;

      const event = await service.push(
        Layer.GOVERNANCE,
        'governance.letter.draft.ready_for_approval',
        { letterId: 'l-1' },
        fakeManager,
      );

      expect(getRepositorySpy).toHaveBeenCalledWith(OutboxEvent);
      expect(txRepo.rows).toHaveLength(1);
      expect(txRepo.rows[0]).toBe(event);
    });
  });

  describe('poll — FIFO consumer', () => {
    it('dispatches pending events in insertion order (oldest first)', async () => {
      const { service } = makeService();

      await service.push(Layer.ENGINEERING, 'engineering.clash.ingested', {
        n: 1,
      });
      await service.push(Layer.PLANNING, 'planning.audit.alert.raised', {
        n: 2,
      });
      await service.push(Layer.ENGINEERING, 'engineering.clash.ingested', {
        n: 3,
      });

      const seen: number[] = [];
      const handlers: OutboxEventHandlerMap = {
        'engineering.clash.ingested': (e) => {
          seen.push((e.payload as { n: number }).n);
        },
        'planning.audit.alert.raised': (e) => {
          seen.push((e.payload as { n: number }).n);
        },
      };

      const result = await service.poll(handlers, { maxAgeMs: 0 });

      expect(seen).toEqual([1, 2, 3]);
      expect(result).toEqual({ processed: 3, failed: 0, skipped: 0 });
    });

    it('honours `batchSize` (does not dispatch more than N per tick)', async () => {
      const { service } = makeService();
      for (let i = 0; i < 5; i++) {
        await service.push(Layer.REPORTS, 'reports.monthly.snapshot.taken', {
          i,
        });
      }

      const handler = jest.fn().mockResolvedValue(undefined);
      const result = await service.poll(
        { 'reports.monthly.snapshot.taken': handler },
        { batchSize: 2, maxAgeMs: 0 },
      );

      expect(handler).toHaveBeenCalledTimes(2);
      expect(result.processed).toBe(2);
    });
  });

  describe('poll — no double-process via processedAt update', () => {
    it('stamps `processedAt` + `processedBy` exactly once and skips it on the next tick', async () => {
      const { service, repo } = makeService();

      await service.push(Layer.SIMULATION, 'simulation.scenario.created', {
        scenarioId: 's-1',
      });

      const handler = jest.fn().mockResolvedValue(undefined);
      const handlers: OutboxEventHandlerMap = {
        'simulation.scenario.created': handler,
      };

      const first = await service.poll(handlers, { maxAgeMs: 0 });
      expect(first.processed).toBe(1);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(repo.rows[0].processedAt).toBeInstanceOf(Date);
      expect(repo.rows[0].processedBy).toBe(DEFAULT_PROCESSED_BY);

      // Second tick must not re-invoke the handler — the row is no longer pending.
      const second = await service.poll(handlers, { maxAgeMs: 0 });
      expect(second).toEqual({ processed: 0, failed: 0, skipped: 0 });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('leaves the row pending (no stamp) when the handler throws — retried next tick', async () => {
      const { service, repo } = makeService();

      await service.push(Layer.GOVERNANCE, 'governance.letter.received', {
        letterId: 'l-1',
      });

      let attempts = 0;
      const handler = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts === 1) throw new Error('downstream offline');
      });

      const first = await service.poll(
        { 'governance.letter.received': handler },
        { maxAgeMs: 0 },
      );
      expect(first).toEqual({ processed: 0, failed: 1, skipped: 0 });
      // Critical: the row stayed pending. No stamp = retry safe.
      expect(repo.rows[0].processedAt).toBeNull();
      expect(repo.rows[0].processedBy).toBeNull();

      const second = await service.poll(
        { 'governance.letter.received': handler },
        { maxAgeMs: 0 },
      );
      expect(second).toEqual({ processed: 1, failed: 0, skipped: 0 });
      expect(repo.rows[0].processedAt).toBeInstanceOf(Date);
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('skips events whose `eventType` has no registered handler (still pending after the tick)', async () => {
      const { service, repo } = makeService();
      await service.push(
        Layer.PLANNING,
        'planning.baseline.job.awaiting_approval',
        { jobId: 'j-1' },
      );

      const result = await service.poll({}, { maxAgeMs: 0 });
      expect(result).toEqual({ processed: 0, failed: 0, skipped: 1 });
      expect(repo.rows[0].processedAt).toBeNull();
    });

    it('uses the caller-supplied `processedBy` tag', async () => {
      const { service, repo } = makeService();
      await service.push(Layer.REPORTS, 'reports.monthly.rendered', {
        reportId: 'r-1',
      });

      await service.poll(
        { 'reports.monthly.rendered': () => undefined },
        { maxAgeMs: 0, processedBy: 'reports-subscriber-v1' },
      );

      expect(repo.rows[0].processedBy).toBe('reports-subscriber-v1');
    });
  });

  describe('pendingCount', () => {
    it('counts only unprocessed rows', async () => {
      const { service } = makeService();
      await service.push(Layer.ENGINEERING, 'engineering.clash.ingested', {
        n: 1,
      });
      await service.push(Layer.ENGINEERING, 'engineering.clash.ingested', {
        n: 2,
      });

      expect(await service.pendingCount()).toBe(2);

      await service.poll(
        { 'engineering.clash.ingested': () => undefined },
        { maxAgeMs: 0 },
      );

      expect(await service.pendingCount()).toBe(0);
    });
  });
});
