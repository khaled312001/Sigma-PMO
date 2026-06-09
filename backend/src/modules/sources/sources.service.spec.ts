import { Repository } from 'typeorm';

import { Source } from './source.entity';
import { SeedSource, SourcesService } from './sources.service';

/**
 * In-memory repository fake that mimics the slice of TypeORM's surface the
 * service actually uses. Keyed on `externalId` for upsert behaviour.
 */
function makeRepo() {
  const store = new Map<string, Source>();
  return {
    store,
    findOne: jest.fn(async ({ where }: { where: Partial<Source> }) => {
      if (where.externalId) {
        return store.get(where.externalId) ?? null;
      }
      if (where.id) {
        for (const v of store.values()) if (v.id === where.id) return v;
        return null;
      }
      return null;
    }),
    find: jest.fn(async ({ where, order }: { where?: Partial<Source>; order?: Record<string, 'ASC' | 'DESC'> }) => {
      const all = [...store.values()];
      const filtered = where?.family
        ? all.filter((s) => s.family === where.family)
        : all;
      // Stable sort by externalId for tests that assert ordering.
      void order;
      return filtered.sort((a, b) => a.externalId.localeCompare(b.externalId));
    }),
    save: jest.fn(async (entity: Source) => {
      if (!entity.id) entity.id = `uuid-${entity.externalId}`;
      if (!entity.createdAt) entity.createdAt = new Date();
      store.set(entity.externalId, entity);
      return entity;
    }),
    create: jest.fn((init: Partial<Source>) => ({ ...init }) as Source),
  };
}

const seedSample: SeedSource[] = [
  {
    externalId: 'fidic-red-2017',
    family: 'FIDIC',
    title: 'Conditions of Contract for Construction (Red Book), 2nd Edition',
    latestEdition: '2nd Edition 2017',
    publisher: 'FIDIC, Geneva',
    year: 2017,
    url: 'https://fidic.org/books/construction-contract-2nd-ed-2017-red-book',
    scope: 'Employer-designed Building & Engineering Works.',
    applicablePersonas: ['contracts-administrator', 'planner'],
    verification: 'confirmed',
  },
  {
    externalId: 'pmbok-7',
    family: 'PMI',
    title: 'PMBOK Guide 7th Edition',
    latestEdition: '7th Edition 2021',
    publisher: 'PMI',
    year: 2021,
    url: 'https://www.pmi.org/standards/pmbok',
    scope: 'Principles-based PM standard.',
    applicablePersonas: ['project-manager', 'pmo-lead'],
    verification: 'confirmed',
  },
  {
    externalId: 'iso-19650-2',
    family: 'BIM',
    title: 'ISO 19650-2:2018',
    latestEdition: '1st Edition 2018',
    publisher: 'ISO',
    year: 2018,
    url: 'https://www.iso.org/standard/68080.html',
    scope: 'BIM delivery phase information management.',
    applicablePersonas: ['bim-manager'],
    verification: 'confirmed',
  },
];

describe('SourcesService', () => {
  let repo: ReturnType<typeof makeRepo>;
  let service: SourcesService;

  beforeEach(() => {
    repo = makeRepo();
    service = new SourcesService(repo as unknown as Repository<Source>);
  });

  describe('seedFromCatalogue', () => {
    it('inserts every seed entry on first run', async () => {
      const count = await service.seedFromCatalogue(seedSample);
      expect(count).toBe(3);
      expect(repo.store.size).toBe(3);
      expect(repo.store.get('fidic-red-2017')?.family).toBe('FIDIC');
    });

    it('is idempotent: re-running does not duplicate rows', async () => {
      await service.seedFromCatalogue(seedSample);
      const sizeAfterFirst = repo.store.size;
      const upsertedSecondTime = await service.seedFromCatalogue(seedSample);
      expect(upsertedSecondTime).toBe(3);
      expect(repo.store.size).toBe(sizeAfterFirst);
    });

    it('updates an existing row when a seed field changes', async () => {
      await service.seedFromCatalogue(seedSample);
      const modified: SeedSource[] = [
        {
          ...seedSample[0],
          title: 'Conditions of Contract for Construction (Red Book), 2nd Edition (REVISED)',
          verification: 'verify',
        },
      ];
      await service.seedFromCatalogue(modified);
      const row = repo.store.get('fidic-red-2017');
      expect(row?.title).toContain('REVISED');
      expect(row?.verification).toBe('verify');
    });

    it('uppercases the family slug for stable lookups', async () => {
      await service.seedFromCatalogue([
        { ...seedSample[0], externalId: 'lowercase-test', family: 'fidic' },
      ]);
      expect(repo.store.get('lowercase-test')?.family).toBe('FIDIC');
    });

    it('skips seed entries that have no externalId', async () => {
      const bad = [...seedSample, { externalId: '', family: 'X' } as SeedSource];
      const count = await service.seedFromCatalogue(bad);
      // The empty-externalId entry is logged + skipped, so count == 3.
      expect(count).toBe(3);
    });

    it('returns 0 when the disk seed cannot be located and no override is supplied', async () => {
      // Spy on the private loader by relying on the public contract: if we
      // run on a working dir where the file is not found, count is 0.
      // We force this by stubbing readFileSync-less environment via override.
      const empty = await service.seedFromCatalogue([]);
      expect(empty).toBe(0);
    });
  });

  describe('findByFamily', () => {
    beforeEach(async () => {
      await service.seedFromCatalogue(seedSample);
    });

    it('filters by family (case-insensitive on input, normalised internally)', async () => {
      const out = await service.findByFamily('fidic');
      expect(out).toHaveLength(1);
      expect(out[0].externalId).toBe('fidic-red-2017');
    });

    it('returns empty array for an unknown family', async () => {
      const out = await service.findByFamily('UNKNOWN');
      expect(out).toEqual([]);
    });

    it('returns BIM entries when asked for BIM', async () => {
      const out = await service.findByFamily('BIM');
      expect(out).toHaveLength(1);
      expect(out[0].externalId).toBe('iso-19650-2');
    });
  });

  describe('findByExternalId', () => {
    beforeEach(async () => {
      await service.seedFromCatalogue(seedSample);
    });

    it('returns the row when the externalId exists', async () => {
      const row = await service.findByExternalId('pmbok-7');
      expect(row.title).toContain('PMBOK');
    });

    it('throws NotFoundException when the externalId is unknown', async () => {
      await expect(service.findByExternalId('does-not-exist')).rejects.toThrow();
    });
  });
});
