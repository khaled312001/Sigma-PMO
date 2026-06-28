import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Workbook } from 'exceljs';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { Layer, SourceType } from '../../common/enums';
import { BoQ, BoqItem, SourceFile } from '../canonical/entities';
import { StorageService } from '../ingestion/storage/storage.service';
import { OutboxService } from '../outbox/outbox.service';
import { BoqExcelParser } from './parsers/boq-excel.parser';
import {
  BOQ_BUSINESS_KEY_PREFIX,
  BOQ_INGESTED_EVENT_TYPE,
  BoqIngestionService,
} from './boq-ingestion.service';

/**
 * Golden BoQ fixture builder — produces a 3-line BoQ workbook the parser
 * accepts: header band on row 1 carrying `Currency: AED` + `Prepared by: …`,
 * column headers on row 3, and three data rows. Wrapped in a helper so the
 * "amount mismatch" test can mutate one cell without rebuilding the rest.
 */
async function buildBoqWorkbook(
  opts: {
    amountOverrides?: Record<number, number>;
    extraRows?: {
      itemNumber: string;
      description: string;
      unit: string;
      qty: number;
      rate: number;
      amount: number;
    }[];
    withActivityRef?: boolean;
  } = {},
): Promise<Buffer> {
  const wb = new Workbook();
  const sheet = wb.addWorksheet('BoQ');

  // Cover band — currency + preparer get picked up by `readHeaderMetadata`.
  sheet.getCell('A1').value = 'Currency:';
  sheet.getCell('B1').value = 'AED';
  sheet.getCell('A2').value = 'Prepared by:';
  sheet.getCell('B2').value = 'Sigma PMO';

  // Column headers — row 3.
  const headers = [
    'Item No.',
    'Description',
    'Unit',
    'Quantity',
    'Unit Rate',
    'Amount',
  ];
  if (opts.withActivityRef) headers.push('Activity Ref');
  headers.forEach((h, i) => {
    sheet.getCell(3, i + 1).value = h;
  });

  // Three baseline rows; amounts are quantity * rate so the parser does not warn.
  const rows = [
    {
      itemNumber: '1.1',
      description: 'Site clearance',
      unit: 'm2',
      qty: 1200,
      rate: 5.5,
      amount: 6600,
    },
    {
      itemNumber: '1.2',
      description: 'Excavation up to 3m depth',
      unit: 'm3',
      qty: 850,
      rate: 32,
      amount: 27200,
    },
    {
      itemNumber: '2.1',
      description: 'PCC 1:3:6',
      unit: 'm3',
      qty: 120,
      rate: 480,
      amount: 57600,
    },
    ...(opts.extraRows ?? []),
  ];

  rows.forEach((row, idx) => {
    const r = 4 + idx;
    const amount = opts.amountOverrides?.[idx] ?? row.amount;
    sheet.getCell(r, 1).value = row.itemNumber;
    sheet.getCell(r, 2).value = row.description;
    sheet.getCell(r, 3).value = row.unit;
    sheet.getCell(r, 4).value = row.qty;
    sheet.getCell(r, 5).value = row.rate;
    sheet.getCell(r, 6).value = amount;
    if (opts.withActivityRef) {
      sheet.getCell(r, 7).value = `ACT-${row.itemNumber}`;
    }
  });

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}

/**
 * In-memory repository double — captures `save` payloads so assertions can
 * inspect what the service tried to persist without standing up a real DB.
 *
 * Each `save` call records the entity in `saved`, assigning a deterministic
 * id (`${prefix}-${n}`) so the BoQ → BoqItem foreign key chain can be
 * checked end to end.
 */
function makeRepoLike(idPrefix: string): {
  saved: any[];
  findOne: jest.Mock;
  find: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
} {
  let n = 0;
  const saved: any[] = [];
  return {
    saved,
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn(async (e) => {
      if (Array.isArray(e)) {
        for (const one of e) {
          n += 1;
          one.id = one.id ?? `${idPrefix}-${n}`;
          saved.push(one);
        }
        return e;
      }
      if (!e.id) {
        n += 1;
        e.id = `${idPrefix}-${n}`;
      }
      saved.push(e);
      return e;
    }),
    create: jest.fn((e) => ({ ...e })),
  };
}

/**
 * Build a fake DataSource that yields per-test `EntityManager` whose
 * `.getRepository(Entity)` returns the right repo double. Returns the
 * sub-repos so the test can assert against them.
 */
function makeDataSource() {
  const sourceFileRepo = makeRepoLike('sf');
  const boqRepo = makeRepoLike('boq');
  const itemRepo = makeRepoLike('item');

  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === SourceFile) return sourceFileRepo;
      if (entity === BoQ) return boqRepo;
      if (entity === BoqItem) return itemRepo;
      throw new Error(
        `Unexpected repo request for ${(entity as { name?: string }).name ?? entity}`,
      );
    }),
  } as unknown as EntityManager;

  const dataSource = {
    transaction: jest.fn(async (cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager),
    ),
  } as unknown as DataSource;

  return { dataSource, manager, sourceFileRepo, boqRepo, itemRepo };
}

function makeStorage(): Pick<StorageService, 'sha256' | 'archive'> {
  return {
    sha256: jest.fn((buf: Buffer) => `sha-${buf.byteLength}`),
    archive: jest.fn(async (filename: string) => `/data/storage/${filename}`),
  };
}

function makeOutbox(): { push: jest.Mock; service: OutboxService } {
  const push = jest.fn().mockResolvedValue({ id: 'event-1' });
  return { push, service: { push } as unknown as OutboxService };
}

describe('BoqIngestionService', () => {
  let parser: BoqExcelParser;
  let storage: ReturnType<typeof makeStorage>;
  let outbox: ReturnType<typeof makeOutbox>;
  let ds: ReturnType<typeof makeDataSource>;
  let topLevelBoqRepo: ReturnType<typeof makeRepoLike>;
  let topLevelItemRepo: ReturnType<typeof makeRepoLike>;
  let service: BoqIngestionService;

  beforeEach(() => {
    parser = new BoqExcelParser();
    storage = makeStorage();
    outbox = makeOutbox();
    ds = makeDataSource();
    topLevelBoqRepo = makeRepoLike('boq-top');
    topLevelItemRepo = makeRepoLike('item-top');

    service = new BoqIngestionService(
      ds.dataSource,
      topLevelBoqRepo as unknown as Repository<BoQ>,
      topLevelItemRepo as unknown as Repository<BoqItem>,
      parser,
      storage as unknown as StorageService,
      outbox.service,
    );
  });

  describe('ingest (golden file)', () => {
    it('parses a clean 3-line BoQ, persists header + items + outbox row in one txn', async () => {
      const buffer = await buildBoqWorkbook();

      const outcome = await service.ingest('P-1000', 'boq-mall.xlsx', buffer);

      // Outcome shape.
      expect(outcome.businessKey).toBe(`${BOQ_BUSINESS_KEY_PREFIX}P-1000`);
      expect(outcome.version).toBe(1);
      expect(outcome.itemCount).toBe(3);
      expect(outcome.currency).toBe('AED');
      // 6600 + 27200 + 57600 = 91400.00 (decimal precision preserved).
      expect(outcome.totalAmount).toBe('91400.00');
      expect(outcome.warnings).toEqual([]);

      // SourceFile persisted with the right sourceType + archived hash.
      expect(storage.sha256).toHaveBeenCalledTimes(1);
      expect(storage.archive).toHaveBeenCalledTimes(1);
      const sourceFile = ds.sourceFileRepo.saved[0];
      expect(sourceFile.sourceType).toBe(SourceType.EXCEL);
      expect(sourceFile.filename).toBe('boq-mall.xlsx');
      expect(sourceFile.contentSha256).toMatch(/^sha-/);

      // BoQ header persisted with derived totals + authoredBy from cover band.
      const boqRow = ds.boqRepo.saved[0];
      expect(boqRow.businessKey).toBe(`${BOQ_BUSINESS_KEY_PREFIX}P-1000`);
      expect(boqRow.version).toBe(1);
      expect(boqRow.isCurrent).toBe(true);
      expect(boqRow.totalAmount).toBe('91400.00');
      expect(boqRow.currency).toBe('AED');
      expect(boqRow.authoredBy).toBe('Sigma PMO');
      expect(boqRow.sourceFileId).toBe(sourceFile.id);

      // BoqItem rows persisted with FK to the BoQ header.
      expect(ds.itemRepo.saved).toHaveLength(3);
      for (const item of ds.itemRepo.saved) {
        expect(item.boqId).toBe(boqRow.id);
      }
      const items = ds.itemRepo.saved as BoqItem[];
      expect(items.map((i) => i.itemNumber)).toEqual(['1.1', '1.2', '2.1']);
      expect(items[0].quantity).toBe('1200.0000');
      expect(items[0].unitRate).toBe('5.50');
      expect(items[0].amount).toBe('6600.00');
      // Activity link defaults to null when the column is absent.
      expect(items[0].activityRef).toBeNull();

      // Outbox push lands on the planning namespace, in the same txn,
      // with the new BoQ row id as the correlation handle.
      expect(outbox.push).toHaveBeenCalledTimes(1);
      const [layer, eventType, payload, manager, options] =
        outbox.push.mock.calls[0];
      expect(layer).toBe(Layer.PLANNING);
      expect(eventType).toBe(BOQ_INGESTED_EVENT_TYPE);
      expect(eventType.startsWith('planning.')).toBe(true); // ADR-0012 §6 prefix
      expect(manager).toBe(ds.manager);
      expect(options).toEqual({ correlationId: boqRow.id });
      expect(payload).toMatchObject({
        boqId: boqRow.id,
        projectBusinessKey: 'P-1000',
        businessKey: `${BOQ_BUSINESS_KEY_PREFIX}P-1000`,
        version: 1,
        itemCount: 3,
        currency: 'AED',
        totalAmount: '91400.00',
        sourceFileId: sourceFile.id,
        warnings: [],
      });

      // The whole write happened in a single transaction.
      expect(ds.dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('binds the optional ActivityRef column when present', async () => {
      const buffer = await buildBoqWorkbook({ withActivityRef: true });

      await service.ingest('P-1000', 'boq-with-acts.xlsx', buffer);

      const items = ds.itemRepo.saved as BoqItem[];
      expect(items.map((i) => i.activityRef)).toEqual([
        'ACT-1.1',
        'ACT-1.2',
        'ACT-2.1',
      ]);
    });

    it('bumps version and flips the prior isCurrent row on re-ingest', async () => {
      const buffer = await buildBoqWorkbook();
      // First ingest establishes v1.
      await service.ingest('P-1000', 'boq-mall.xlsx', buffer);

      // Reset call recorders for clarity, then seed a prior row for round 2.
      const round2 = makeDataSource();
      const round2Outbox = makeOutbox();
      const prior: BoQ = {
        id: 'prior-boq',
        createdAt: new Date(),
        businessKey: `${BOQ_BUSINESS_KEY_PREFIX}P-1000`,
        version: 3,
        isCurrent: true,
        currency: 'AED',
        totalAmount: '99.00',
        sourceFileId: 'old-source',
        authoredBy: 'someone',
        journeyCorrelationId: null,
      };
      round2.boqRepo.findOne.mockResolvedValueOnce(prior);

      const service2 = new BoqIngestionService(
        round2.dataSource,
        topLevelBoqRepo as unknown as Repository<BoQ>,
        topLevelItemRepo as unknown as Repository<BoqItem>,
        parser,
        storage as unknown as StorageService,
        round2Outbox.service,
      );

      const outcome = await service2.ingest(
        'P-1000',
        'boq-mall-v2.xlsx',
        buffer,
      );

      expect(outcome.version).toBe(4); // prior.version + 1
      // The prior row was saved with isCurrent flipped to false.
      const flipped = round2.boqRepo.saved.find((r) => r.id === 'prior-boq');
      expect(flipped).toBeDefined();
      expect(flipped.isCurrent).toBe(false);
      // The new row is current at v4.
      const newRow = round2.boqRepo.saved.find((r) => r.id !== 'prior-boq');
      expect(newRow.version).toBe(4);
      expect(newRow.isCurrent).toBe(true);
    });

    it('warns (but does not fail) when amount drifts from qty * rate by > 1%', async () => {
      // Replace row 1's amount with a 5% mismatch: 6600 -> 7000.
      const buffer = await buildBoqWorkbook({ amountOverrides: { 0: 7000 } });

      const outcome = await service.ingest('P-1000', 'boq-drift.xlsx', buffer);

      expect(outcome.warnings.length).toBeGreaterThanOrEqual(1);
      expect(outcome.warnings[0]).toMatch(/differs from quantity\*rate/);
      // Persisted amount is the source value, not the recomputed one.
      const items = ds.itemRepo.saved as BoqItem[];
      expect(items[0].amount).toBe('7000.00');
    });

    it('rejects an empty projectBusinessKey before touching storage', async () => {
      const buffer = await buildBoqWorkbook();
      await expect(
        service.ingest('', 'boq-mall.xlsx', buffer),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.archive).not.toHaveBeenCalled();
      expect(outbox.push).not.toHaveBeenCalled();
    });

    it('rejects unsupported filenames', async () => {
      const buffer = await buildBoqWorkbook();
      await expect(
        service.ingest('P-1000', 'boq.csv', buffer),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an empty buffer', async () => {
      await expect(
        service.ingest('P-1000', 'boq.xlsx', Buffer.alloc(0)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a BoQ Excel with no usable lines', async () => {
      // Build a workbook with only the cover band + headers, no data rows.
      const wb = new Workbook();
      const sheet = wb.addWorksheet('BoQ');
      sheet.getCell('A1').value = 'Item No.';
      sheet.getCell('B1').value = 'Description';
      sheet.getCell('C1').value = 'Unit';
      sheet.getCell('D1').value = 'Quantity';
      sheet.getCell('E1').value = 'Unit Rate';
      sheet.getCell('F1').value = 'Amount';
      const buffer = Buffer.from(await wb.xlsx.writeBuffer());

      await expect(
        service.ingest('P-1000', 'empty.xlsx', buffer),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      // No outbox event for a failed parse.
      expect(outbox.push).not.toHaveBeenCalled();
    });
  });

  describe('listVersions + getCurrent', () => {
    it('listVersions queries by businessKey with the boq: prefix', async () => {
      const rows = [{ id: 'v2' }, { id: 'v1' }] as BoQ[];
      topLevelBoqRepo.find.mockResolvedValueOnce(rows);

      const out = await service.listVersions('P-1000');

      expect(out).toBe(rows);
      expect(topLevelBoqRepo.find).toHaveBeenCalledWith({
        where: { businessKey: `${BOQ_BUSINESS_KEY_PREFIX}P-1000` },
        order: { version: 'DESC' },
      });
    });

    it('getCurrent returns header + items when present', async () => {
      const boq = {
        id: 'boq-1',
        businessKey: `${BOQ_BUSINESS_KEY_PREFIX}P-1000`,
      } as BoQ;
      const items = [{ id: 'i1', boqId: 'boq-1' }] as BoqItem[];
      topLevelBoqRepo.findOne.mockResolvedValueOnce(boq);
      topLevelItemRepo.find.mockResolvedValueOnce(items);

      const out = await service.getCurrent('P-1000');

      expect(out.boq).toBe(boq);
      expect(out.items).toBe(items);
      expect(topLevelBoqRepo.findOne).toHaveBeenCalledWith({
        where: {
          businessKey: `${BOQ_BUSINESS_KEY_PREFIX}P-1000`,
          isCurrent: true,
        },
      });
      expect(topLevelItemRepo.find).toHaveBeenCalledWith({
        where: { boqId: 'boq-1' },
        order: { itemNumber: 'ASC' },
      });
    });

    it('getCurrent throws NotFound when no BoQ exists for the project', async () => {
      topLevelBoqRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.getCurrent('P-9999')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
