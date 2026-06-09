import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Source } from './source.entity';

/** Patch shape used by upsert. All persisted columns except `id` are optional. */
export type SourcePatch = Partial<
  Pick<
    Source,
    | 'externalId'
    | 'family'
    | 'title'
    | 'latestEdition'
    | 'publisher'
    | 'year'
    | 'url'
    | 'scope'
    | 'applicablePersonas'
    | 'verification'
  >
>;

/** Shape of a single seed-file entry. Mirrors the seed JSON keys exactly. */
export interface SeedSource {
  externalId: string;
  family: string;
  title: string;
  latestEdition: string;
  publisher: string;
  year: number;
  url: string;
  scope: string;
  applicablePersonas: string[];
  verification?: string;
}

/**
 * Curated registry of authoritative scientific + professional references
 * (FIDIC, PMI, ISO, AACE, BIM, Primavera) that the platform's expert
 * personas are allowed to cite. See `source.entity.ts` for the rules.
 *
 * Read endpoints are wide open to any authenticated role. Writes are NOT
 * exposed via HTTP in Wave 2 — the catalogue evolves by editing
 * `sources.seed.json` and re-booting (the seeder upserts on `externalId`).
 *
 * Seeding is idempotent:
 *  - First boot inserts every row.
 *  - Subsequent boots upsert only changed fields (the loader compares on
 *    `externalId`).
 *  - Removing a row from the JSON does NOT delete the DB row — keeps audit
 *    trail intact even if a curator decommissions a source.
 */
@Injectable()
export class SourcesService {
  private readonly logger = new Logger(SourcesService.name);

  constructor(
    @InjectRepository(Source) private readonly sources: Repository<Source>,
  ) {}

  /** Every source, ordered alphabetically by externalId for stable UIs. */
  listAll(): Promise<Source[]> {
    return this.sources.find({ order: { externalId: 'ASC' } });
  }

  async findById(id: string): Promise<Source> {
    const row = await this.sources.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`No source with id ${id}`);
    return row;
  }

  async findByExternalId(externalId: string): Promise<Source> {
    const row = await this.sources.findOne({ where: { externalId } });
    if (!row) throw new NotFoundException(`No source with externalId ${externalId}`);
    return row;
  }

  /** All sources in one family, ordered by externalId. */
  findByFamily(family: string): Promise<Source[]> {
    return this.sources.find({
      where: { family: family.toUpperCase() },
      order: { externalId: 'ASC' },
    });
  }

  /**
   * Upsert keyed on `externalId`. Used by both the seeder and (in future
   * cycles) an admin write endpoint. When an existing row is found, all
   * provided fields are overwritten; missing fields stay as-is.
   */
  async upsert(externalId: string, patch: SourcePatch): Promise<Source> {
    const existing = await this.sources.findOne({ where: { externalId } });
    if (!existing) {
      const next = this.sources.create({
        externalId,
        family: (patch.family ?? '').toUpperCase(),
        title: patch.title ?? externalId,
        latestEdition: patch.latestEdition ?? '',
        publisher: patch.publisher ?? '',
        year: patch.year ?? 0,
        url: patch.url ?? '',
        scope: patch.scope ?? '',
        applicablePersonas: patch.applicablePersonas ?? [],
        verification: patch.verification ?? 'verify',
      });
      return this.sources.save(next);
    }
    if (patch.family !== undefined) existing.family = patch.family.toUpperCase();
    if (patch.title !== undefined) existing.title = patch.title;
    if (patch.latestEdition !== undefined) existing.latestEdition = patch.latestEdition;
    if (patch.publisher !== undefined) existing.publisher = patch.publisher;
    if (patch.year !== undefined) existing.year = patch.year;
    if (patch.url !== undefined) existing.url = patch.url;
    if (patch.scope !== undefined) existing.scope = patch.scope;
    if (patch.applicablePersonas !== undefined) {
      existing.applicablePersonas = patch.applicablePersonas;
    }
    if (patch.verification !== undefined) existing.verification = patch.verification;
    return this.sources.save(existing);
  }

  /**
   * Idempotent seed loader. Reads `sources.seed.json` from disk and upserts
   * each entry on `externalId`. Called from the module's `onApplicationBootstrap`.
   *
   * Returns the number of rows upserted so callers (and tests) can assert.
   */
  async seedFromCatalogue(seedOverride?: SeedSource[]): Promise<number> {
    const entries = seedOverride ?? this.loadSeedFromDisk();
    if (!entries) {
      this.logger.warn('Source seed catalogue not found; skipping seedFromCatalogue()');
      return 0;
    }
    let count = 0;
    for (const entry of entries) {
      if (!entry?.externalId) {
        this.logger.warn('Skipping seed entry without externalId');
        continue;
      }
      await this.upsert(entry.externalId, {
        externalId: entry.externalId,
        family: entry.family,
        title: entry.title,
        latestEdition: entry.latestEdition,
        publisher: entry.publisher,
        year: entry.year,
        url: entry.url,
        scope: entry.scope,
        applicablePersonas: entry.applicablePersonas,
        verification: entry.verification ?? 'verify',
      });
      count += 1;
    }
    this.logger.log(`Source registry seeded (${count} entries)`);
    return count;
  }

  /** Locate + parse the seed JSON, robust to ts-node/dist/CWD differences. */
  private loadSeedFromDisk(): SeedSource[] | null {
    const candidates = [
      join(__dirname, 'sources.seed.json'),
      join(__dirname, '..', '..', '..', 'src', 'modules', 'sources', 'sources.seed.json'),
      join(process.cwd(), 'backend', 'src', 'modules', 'sources', 'sources.seed.json'),
      join(process.cwd(), 'src', 'modules', 'sources', 'sources.seed.json'),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        const raw = readFileSync(candidate, 'utf8');
        try {
          const parsed = JSON.parse(raw) as SeedSource[];
          if (!Array.isArray(parsed)) {
            this.logger.warn(`Source seed at ${candidate} is not an array; skipping`);
            return null;
          }
          return parsed;
        } catch (err) {
          this.logger.warn(
            `Failed to parse source seed at ${candidate}: ${(err as Error).message}`,
          );
          return null;
        }
      }
    }
    return null;
  }
}
