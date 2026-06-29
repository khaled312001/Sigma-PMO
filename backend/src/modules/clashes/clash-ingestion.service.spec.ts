import { Workbook } from 'exceljs';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { Layer, IngestionStatus } from '../../common/enums';
import { ClashItem, IngestionRun, ProjectRecord, SourceFile } from '../canonical/entities';
import { StorageService } from '../ingestion/storage/storage.service';
import { OutboxService } from '../outbox/outbox.service';
import { ClashIngestionService } from './clash-ingestion.service';
import { GeometricClashService } from './geometric-clash.service';
import { IfcGeometryService } from './ifc-geometry.service';
import {
  ClashExcelParser,
  composeDescription,
  deriveSeverity,
} from './parsers/clash-excel.parser';

/**
 * Golden-file generator: builds an in-memory `.xlsx` that mirrors the layout
 * Navisworks 2023+ produces for "Clash Detective" → "Export to XLSX":
 *
 *   Row 1   : "Project" header
 *   Row 2-5 : ignored metadata (Run name, View, Tolerance, Created)
 *   Row 6   : column headers (`Clash Name | Status | Distance | Grid Location | Item 1 | Item 2 | ...`)
 *   Row 7+  : one clash per row
 *
 * We deliberately exercise the parser's fuzzy column resolver by mixing the
 * "Item 1" / "Item 2" labels with explicit "Discipline" columns, plus one
 * row that has no `Clash Name` (must be rejected without failing the file).
 */
async function buildGoldenClashWorkbook(): Promise<Buffer> {
  const wb = new Workbook();
  const sheet = wb.addWorksheet('Clashes');

  // Pre-header metadata rows (Navisworks ships project info above the table).
  sheet.addRow(['Project', 'Sample Tower']);
  sheet.addRow(['Run name', 'C-001']);
  sheet.addRow(['View', 'Main']);
  sheet.addRow(['Tolerance', '0.01 m']);
  sheet.addRow(['Created', new Date('2026-06-09T10:00:00Z')]);

  // Header row (the parser sniffs for "Clash Name" in the first 30 rows).
  sheet.addRow([
    'Clash Name',
    'Status',
    'Distance (mm)',
    'Grid Location',
    'Item 1',
    'Item 1 GUID',
    'Item 1 Discipline',
    'Item 2',
    'Item 2 GUID',
    'Item 2 Discipline',
  ]);

  // Data rows.
  sheet.addRow([
    'Clash-001',
    'New',
    72.5,
    'A-3',
    'Duct DC-101',
    '0XncT9aQ1A$ABC000000001',
    'Mechanical',
    'Cable Tray CT-22',
    '0XncT9aQ1A$ABC000000002',
    'Electrical',
  ]);
  sheet.addRow([
    'Clash-002',
    'Active',
    18.2,
    'B-5',
    'Pipe PP-08',
    '',
    '', // no discipline — parser falls back to name-sniff ("pipe" → plumbing)
    'Beam B-12',
    '',
    '', // name-sniff → "beam" → structural
  ]);
  sheet.addRow([
    'Clash-003',
    'Reviewed',
    5.0,
    'C-1',
    'Wall W-1',
    '',
    'Architectural',
    'Column C-1',
    '',
    'Structural',
  ]);
  sheet.addRow([
    'Clash-004',
    'Hard',
    120.0,
    'D-2',
    'Cable Tray CT-99',
    '',
    'Electrical',
    'Beam B-77',
    '',
    'Structural',
  ]);
  // Malformed row — no clash name. Parser must reject this without failing.
  sheet.addRow(['', 'New', 10.0, 'X-1', 'Mystery Element', '', 'Unknown', 'Other', '', 'Unknown']);

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}

/**
 * In-memory ClashItem repository fake that mimics the slice of the TypeORM
 * surface our service uses (`create`, `save`, `find`, `findOne`). Identical
 * shape to the fake used by `sources.service.spec.ts`.
 */
function makeClashRepo() {
  const store = new Map<string, ClashItem>();
  let idCounter = 1;
  const repo = {
    store,
    create: jest.fn(<T extends Partial<ClashItem>>(init: T): ClashItem => ({ ...init }) as ClashItem),
    save: jest.fn(async (entity: ClashItem) => {
      if (!entity.id) entity.id = `clash-${idCounter++}`;
      if (!entity.createdAt) entity.createdAt = new Date();
      store.set(entity.id, entity);
      return entity;
    }),
    find: jest.fn(async ({ where }: { where?: Partial<ClashItem> }) => {
      const all = [...store.values()];
      if (where?.projectBusinessKey) {
        return all.filter((c) => c.projectBusinessKey === where.projectBusinessKey);
      }
      return all;
    }),
    findOne: jest.fn(async ({ where }: { where: Partial<ClashItem> }) => {
      if (where.id) return store.get(where.id) ?? null;
      return null;
    }),
  };
  return repo;
}

/** Generic repository fake used for SourceFile + IngestionRun. */
function makeGenericRepo<T extends { id?: string; createdAt?: Date }>(tag: string) {
  const store = new Map<string, T>();
  let idCounter = 1;
  const repo = {
    store,
    create: jest.fn((init: Partial<T>): T => ({ ...(init as object) }) as T),
    save: jest.fn(async (entity: T) => {
      if (!entity.id) entity.id = `${tag}-${idCounter++}`;
      if (!entity.createdAt) entity.createdAt = new Date();
      store.set(entity.id, entity);
      return entity;
    }),
  };
  return repo;
}

/**
 * Build a DataSource fake that routes `getRepository(SourceFile)` and
 * `getRepository(IngestionRun)` to the right in-memory repo, and runs the
 * transaction callback with the same routing. The fake mirrors the contract
 * `ClashIngestionService` actually relies on: one EntityManager-shaped
 * argument with a `getRepository` method.
 */
function makeDataSource(repos: {
  clashes: ReturnType<typeof makeClashRepo>;
  sourceFiles: ReturnType<typeof makeGenericRepo<SourceFile>>;
  runs: ReturnType<typeof makeGenericRepo<IngestionRun>>;
}) {
  const routeRepo = (entity: unknown) => {
    if (entity === SourceFile) return repos.sourceFiles;
    if (entity === IngestionRun) return repos.runs;
    if (entity === ClashItem) return repos.clashes;
    throw new Error(`Unmocked entity in test: ${(entity as { name?: string })?.name ?? entity}`);
  };
  const fakeManager = {
    getRepository: jest.fn(routeRepo),
  } as unknown as EntityManager;
  return {
    getRepository: jest.fn(routeRepo),
    transaction: jest.fn(async <T>(cb: (mgr: EntityManager) => Promise<T>): Promise<T> => {
      return cb(fakeManager);
    }),
  } as unknown as DataSource;
}

/** Outbox fake — records every push call so we can assert event shape. */
function makeOutbox() {
  const pushes: Array<{
    layer: string;
    eventType: string;
    payload: Record<string, unknown>;
    correlationId: string | null | undefined;
    hadManager: boolean;
  }> = [];
  const fake = {
    pushes,
    push: jest.fn(async (layer, eventType, payload, manager, options) => {
      pushes.push({
        layer: String(layer),
        eventType,
        payload,
        correlationId: options?.correlationId,
        hadManager: manager !== undefined && manager !== null,
      });
      return { id: `evt-${pushes.length}` };
    }),
  };
  return fake as unknown as OutboxService & typeof fake;
}

describe('ClashExcelParser', () => {
  const parser = new ClashExcelParser();

  it('parses a Navisworks-shaped workbook end-to-end', async () => {
    const buf = await buildGoldenClashWorkbook();
    const ds = await parser.parse(buf);

    // 4 valid rows + 1 rejected (no clashRef).
    expect(ds.rows).toHaveLength(4);
    expect(ds.meta.sheetName).toBe('Clashes');
    expect(ds.meta.rejectedRows).toBe(1);
    expect(ds.meta.totalRowsScanned).toBe(5);

    const byRef = Object.fromEntries(ds.rows.map((r) => [r.clashRef, r]));
    expect(byRef['Clash-001'].disciplinesInvolved).toEqual(
      expect.arrayContaining(['mechanical', 'electrical']),
    );
    expect(byRef['Clash-001'].distanceMm).toBe(72.5);

    // Name-sniff fallback when discipline columns are empty.
    expect(byRef['Clash-002'].disciplinesInvolved).toEqual(
      expect.arrayContaining(['plumbing', 'structural']),
    );

    expect(byRef['Clash-003'].disciplinesInvolved).toEqual(
      expect.arrayContaining(['architectural', 'structural']),
    );
    expect(byRef['Clash-004'].status).toBe('Hard');
  });

  it('returns an empty dataset when no headers are found', async () => {
    const wb = new Workbook();
    const sheet = wb.addWorksheet('Random');
    sheet.addRow(['Hello']);
    sheet.addRow(['World']);
    const ab = await wb.xlsx.writeBuffer();
    const ds = await parser.parse(Buffer.from(ab as ArrayBuffer));
    expect(ds.rows).toHaveLength(0);
    expect(ds.meta.totalRowsScanned).toBe(0);
  });

  it('supports() recognises .xlsx and .xlsm only', () => {
    expect(parser.supports('clashes.xlsx')).toBe(true);
    expect(parser.supports('CLASHES.XLSM')).toBe(true);
    expect(parser.supports('clashes.csv')).toBe(false);
    expect(parser.supports('report.pdf')).toBe(false);
  });
});

describe('deriveSeverity', () => {
  it('classifies an unresolved Hard clash as critical', () => {
    expect(deriveSeverity('Hard', 5)).toBe('critical');
  });

  it('classifies a >=50mm overlap as critical', () => {
    expect(deriveSeverity('New', 80)).toBe('critical');
  });

  it('classifies a 20–49mm overlap as major', () => {
    expect(deriveSeverity('New', 25)).toBe('major');
  });

  it('classifies a sub-20mm overlap as minor', () => {
    expect(deriveSeverity('New', 5)).toBe('minor');
  });

  it('classifies any Reviewed status as minor (already resolved)', () => {
    expect(deriveSeverity('Reviewed', 90)).toBe('minor');
    expect(deriveSeverity('Approved', 90)).toBe('minor');
  });

  it('classifies an unknown-distance unresolved clash as minor by default', () => {
    expect(deriveSeverity('New', null)).toBe('minor');
  });
});

describe('composeDescription', () => {
  it('weaves both element names + grid + distance + status', () => {
    const desc = composeDescription({
      clashRef: 'C-1',
      disciplinesInvolved: ['mechanical', 'electrical'],
      status: 'New',
      distanceMm: 30.0,
      gridLocation: 'A-3',
      element1Name: 'Duct DC-101',
      element2Name: 'Cable Tray CT-22',
      element1Guid: null,
      element2Guid: null,
      __raw: {},
    });
    expect(desc).toContain('Duct DC-101');
    expect(desc).toContain('Cable Tray CT-22');
    expect(desc).toContain('A-3');
    expect(desc).toContain('30.0 mm');
    expect(desc).toContain('New');
  });

  it('degrades gracefully when element names are missing', () => {
    const desc = composeDescription({
      clashRef: 'C-1',
      disciplinesInvolved: [],
      status: 'New',
      distanceMm: null,
      gridLocation: null,
      element1Name: '',
      element2Name: '',
      element1Guid: null,
      element2Guid: null,
      __raw: {},
    });
    // No "X clashes with Y", no grid, no overlap — only the bare frame.
    expect(desc).toBe('Clash (status: New)');
  });
});

describe('ClashIngestionService', () => {
  let clashes: ReturnType<typeof makeClashRepo>;
  let sourceFiles: ReturnType<typeof makeGenericRepo<SourceFile>>;
  let runs: ReturnType<typeof makeGenericRepo<IngestionRun>>;
  let dataSource: DataSource;
  let outbox: ReturnType<typeof makeOutbox>;
  let service: ClashIngestionService;

  beforeEach(() => {
    clashes = makeClashRepo();
    sourceFiles = makeGenericRepo<SourceFile>('source');
    runs = makeGenericRepo<IngestionRun>('run');
    dataSource = makeDataSource({ clashes, sourceFiles, runs });
    outbox = makeOutbox();
    service = new ClashIngestionService(
      dataSource,
      clashes as unknown as Repository<ClashItem>,
      new ClashExcelParser(),
      outbox,
    );
  });

  it('rejects an upload without a projectBusinessKey', async () => {
    const buf = await buildGoldenClashWorkbook();
    await expect(service.ingest('clashes.xlsx', buf, '')).rejects.toThrow(/projectBusinessKey/);
  });

  it('rejects an unsupported file extension', async () => {
    await expect(service.ingest('clashes.csv', Buffer.from(''), 'P-1')).rejects.toThrow(/Unsupported/);
  });

  it('parses + persists + emits one outbox event per clash', async () => {
    const buf = await buildGoldenClashWorkbook();
    const outcome = await service.ingest('clashes.xlsx', buf, 'P-1');

    expect(outcome.status).toBe(IngestionStatus.NORMALIZED);
    expect(outcome.counts.clashesParsed).toBe(4);
    expect(outcome.counts.clashesPersisted).toBe(4);
    expect(outcome.counts.rejectedRows).toBe(1);

    // 4 clashes in DB, each tagged with the project key.
    expect(clashes.store.size).toBe(4);
    for (const row of clashes.store.values()) {
      expect(row.projectBusinessKey).toBe('P-1');
      // proposedOptions stays null — Wave 2 ingestion never invents options.
      expect(row.proposedOptions).toBeNull();
      // disciplinesInvolved is always an array (possibly empty).
      expect(Array.isArray(row.disciplinesInvolved)).toBe(true);
      // severity is one of the three allowed buckets.
      expect(['critical', 'major', 'minor']).toContain(row.severity);
    }

    // One SourceFile + one IngestionRun.
    expect(sourceFiles.store.size).toBe(1);
    expect(runs.store.size).toBe(1);

    // 4 outbox events, all on the engineering. namespace, all with a manager.
    expect(outbox.pushes).toHaveLength(4);
    for (const push of outbox.pushes) {
      expect(push.layer).toBe(Layer.ENGINEERING);
      expect(push.eventType).toBe('engineering.clash.ingested');
      expect(push.hadManager).toBe(true);
      expect(push.payload.projectBusinessKey).toBe('P-1');
      expect(push.payload.clashId).toMatch(/^clash-/);
      expect(push.payload.severity).toMatch(/critical|major|minor/);
    }
  });

  it('marks the run FAILED when the workbook contains no clash rows', async () => {
    const wb = new Workbook();
    wb.addWorksheet('Empty').addRow(['nothing']);
    const ab = await wb.xlsx.writeBuffer();
    const buf = Buffer.from(ab as ArrayBuffer);

    const outcome = await service.ingest('empty.xlsx', buf, 'P-2');
    expect(outcome.status).toBe(IngestionStatus.FAILED);
    expect(outcome.counts.clashesPersisted).toBe(0);
    expect(clashes.store.size).toBe(0);
    expect(outbox.pushes).toHaveLength(0);
    // Run was still persisted (audit trail).
    expect(runs.store.size).toBe(1);
  });

  it('uses the ingestionRunId as the outbox correlationId so trace chains line up', async () => {
    const buf = await buildGoldenClashWorkbook();
    const outcome = await service.ingest('clashes.xlsx', buf, 'P-1');
    for (const push of outbox.pushes) {
      expect(push.correlationId).toBe(outcome.runId);
      expect(push.payload.ingestionRunId).toBe(outcome.runId);
    }
  });

  it('listByProject returns only clashes for the matching project', async () => {
    const buf = await buildGoldenClashWorkbook();
    await service.ingest('clashes.xlsx', buf, 'P-1');
    await service.ingest('clashes.xlsx', buf, 'P-2');
    const onlyP1 = await service.listByProject('P-1');
    expect(onlyP1).toHaveLength(4);
    expect(onlyP1.every((c) => c.projectBusinessKey === 'P-1')).toBe(true);
  });

  it('getById throws NotFound for an unknown id', async () => {
    await expect(service.getById('does-not-exist')).rejects.toThrow();
  });

  it('populates typed detail columns (grid, penetration, element GUIDs) on ingest', async () => {
    const buf = await buildGoldenClashWorkbook();
    await service.ingest('clashes.xlsx', buf, 'P-1');
    const rows = [...clashes.store.values()];
    const c1 = rows.find((r) => r.clashRef === 'Clash-001')!;
    expect(c1.gridLocation).toBe('A-3');
    expect(c1.penetrationMm).toBeCloseTo(72.5);
    expect(c1.elementGuidA).toBe('0XncT9aQ1A$ABC000000001');
    expect(c1.elementGuidB).toBe('0XncT9aQ1A$ABC000000002');
    // World coords stay null on the Excel path (Navisworks ships grid, not XYZ).
    expect(c1.locationX).toBeUndefined();
  });

  it('getDetailById lifts typed columns into a first-class detail payload', async () => {
    const buf = await buildGoldenClashWorkbook();
    await service.ingest('clashes.xlsx', buf, 'P-1');
    const anyRow = [...clashes.store.values()].find((r) => r.clashRef === 'Clash-001')!;
    const detail = await service.getDetailById(anyRow.id);
    expect(detail.detail.clashRef).toBe('Clash-001');
    expect(detail.detail.gridLocation).toBe('A-3');
    expect(detail.detail.penetrationMm).toBeCloseTo(72.5);
    expect(detail.detail.elementGuidA).toBe('0XncT9aQ1A$ABC000000001');
    expect(detail.detail.linkedActivityKeys).toEqual([]);
    expect(detail.detail.location).toBeNull();
  });
});

// ── Native geometric clash detect path (Task 1) ──

/** Two crafted IFC models whose duct + beam AABBs overlap (300 mm on X). */
const MECH_IFC = `ISO-10303-21;
DATA;
#1=IFCPROJECT('0prj',$,'MEP',$,$,$,$,$,$);
#10=IFCCARTESIANPOINT((1000.,2000.,3000.));
#11=IFCAXIS2PLACEMENT3D(#10,$,$);
#12=IFCLOCALPLACEMENT($,#11);
#13=IFCCARTESIANPOINT((-200.,-200.,-200.));
#14=IFCBOUNDINGBOX(#13,400.,400.,400.);
#15=IFCSHAPEREPRESENTATION(#16,'Box','BoundingBox',(#14));
#17=IFCPRODUCTDEFINITIONSHAPE($,$,(#15));
#18=IFCFLOWSEGMENT('mecGuid00000001',$,'HVAC Duct DN400',$,$,#12,#17,$);
ENDSEC;
END-ISO-10303-21;`;
const STR_IFC = `ISO-10303-21;
DATA;
#1=IFCPROJECT('0prj',$,'STR',$,$,$,$,$,$);
#10=IFCCARTESIANPOINT((1100.,2000.,3000.));
#11=IFCAXIS2PLACEMENT3D(#10,$,$);
#12=IFCLOCALPLACEMENT($,#11);
#13=IFCCARTESIANPOINT((-200.,-200.,-200.));
#14=IFCBOUNDINGBOX(#13,400.,400.,400.);
#15=IFCSHAPEREPRESENTATION(#16,'Box','BoundingBox',(#14));
#17=IFCPRODUCTDEFINITIONSHAPE($,$,(#15));
#18=IFCBEAM('strGuid00000001',$,'RC Beam B-12',$,$,#12,#17,$);
ENDSEC;
END-ISO-10303-21;`;

describe('ClashIngestionService.detectFromModels (native geometric clash)', () => {
  function buildDetectService() {
    const clashes = makeClashRepo();
    const sourceFiles = makeGenericRepo<SourceFile>('source');
    const recordsStore = new Map<string, ProjectRecord>([
      ['rec-A', { id: 'rec-A', recordType: 'bim-model', projectBusinessKey: 'P-1', details: { storedPath: '/A.ifc' } } as unknown as ProjectRecord],
      ['rec-B', { id: 'rec-B', recordType: 'bim-model', projectBusinessKey: 'P-1', details: { storedPath: '/B.ifc' } } as unknown as ProjectRecord],
    ]);
    const records = {
      findOne: jest.fn(async ({ where }: { where: { id: string } }) => recordsStore.get(where.id) ?? null),
    };
    const storage = {
      read: jest.fn(async (p: string) => Buffer.from(p === '/A.ifc' ? MECH_IFC : STR_IFC, 'utf8')),
    } as unknown as StorageService;

    const routeRepo = (entity: unknown) => {
      if (entity === SourceFile) return sourceFiles;
      if (entity === ClashItem) return clashes;
      throw new Error('unmocked');
    };
    const dataSource = {
      getRepository: jest.fn(routeRepo),
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb({ getRepository: routeRepo })),
    } as unknown as DataSource;
    const outbox = makeOutbox();

    const service = new ClashIngestionService(
      dataSource,
      clashes as unknown as Repository<ClashItem>,
      new ClashExcelParser(),
      outbox,
      undefined,
      records as unknown as Repository<ProjectRecord>,
      storage,
      new IfcGeometryService(),
      new GeometricClashService(),
    );
    return { service, clashes, outbox };
  }

  it('persists ClashItem rows with real coords + GUIDs from file geometry', async () => {
    const { service, clashes, outbox } = buildDetectService();
    const outcome = await service.detectFromModels({
      projectBusinessKey: 'P-1',
      modelAId: 'rec-A',
      modelBId: 'rec-B',
    });

    expect(outcome.clashesPersisted).toBeGreaterThan(0);
    expect(outcome.stats.hardClashes).toBe(1);

    const rows = [...clashes.store.values()];
    expect(rows).toHaveLength(outcome.clashesPersisted);
    const c = rows[0];
    // Coordinates + GUIDs are computed from the IFC geometry, not Excel.
    expect(c.elementGuidA).toBe('mecGuid00000001');
    expect(c.elementGuidB).toBe('strGuid00000001');
    expect(c.locationX).toBeCloseTo(1050, 0);
    expect(c.penetrationMm).toBeCloseTo(300, 0);
    expect(c.severity).toBe('critical');
    expect(c.disciplinesInvolved.sort()).toEqual(['mechanical', 'structural']);

    // One engineering.clash.ingested event per persisted row → drives the
    // existing propose/simulate/apply chain unchanged.
    expect(outbox.pushes).toHaveLength(outcome.clashesPersisted);
    expect(outbox.pushes[0].eventType).toBe('engineering.clash.ingested');
  });

  it('rejects when the two model ids are identical', async () => {
    const { service } = buildDetectService();
    await expect(
      service.detectFromModels({ projectBusinessKey: 'P-1', modelAId: 'rec-A', modelBId: 'rec-A' }),
    ).rejects.toThrow(/two different models/);
  });
});
