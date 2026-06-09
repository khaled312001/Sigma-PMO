import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Layer } from '../../common/enums';
import { Persona } from '../canonical/entities';

/** Patch shape accepted by `upsert` — everything except the keys the
 *  versioning machinery owns (`businessKey` / `version` / `isCurrent`). */
export type PersonaPatch = Partial<
  Pick<
    Persona,
    | 'title'
    | 'layer'
    | 'description'
    | 'systemPrompt'
    | 'rules'
    | 'modelTier'
    | 'temperature'
    | 'ownedByRole'
    | 'authoredBy'
  >
>;

/** Parsed seed file (front-matter + body). */
interface SeedFile {
  slug: string;
  title: string;
  layer: string;
  description: string;
  systemPrompt: string;
  rules: string[];
  modelTier: string;
  temperature: number;
  ownedByRole: string;
}

/**
 * Persona registry — read for any authenticated role, edit (= new version)
 * gated on `canEditPersonas` (sigma_admin only). ADR-0010 §5.
 *
 * Wave 1 stops at append-only versioning + disk seed + lookup. The actual
 * Anthropic SDK binding and `cache_breakpoint_id` plumbing land in C3
 * (Wave 2); the `/admin/personas` UI lands in Wave 3. None of that is in
 * scope here.
 */
@Injectable()
export class PersonasService {
  private readonly logger = new Logger(PersonasService.name);

  constructor(
    @InjectRepository(Persona) private readonly personas: Repository<Persona>,
  ) {}

  /** Every current-version persona, ordered by slug. */
  listAll(): Promise<Persona[]> {
    return this.personas.find({ where: { isCurrent: true }, order: { businessKey: 'ASC' } });
  }

  async findBySlug(slug: string): Promise<Persona> {
    const row = await this.personas.findOne({ where: { businessKey: slug, isCurrent: true } });
    if (!row) throw new NotFoundException(`No current persona with slug ${slug}`);
    return row;
  }

  /** Every current-version persona attached to one layer. */
  findByLayer(layer: Layer | string): Promise<Persona[]> {
    return this.personas.find({ where: { layer: layer as string, isCurrent: true }, order: { businessKey: 'ASC' } });
  }

  /**
   * Append-only edit: if a prior current row exists for `slug`, flip it to
   * `isCurrent = false` and insert a new row at `version = prior.version + 1`.
   * If no prior row exists, create version 1 — the seed loader uses this same
   * path on first boot.
   */
  async upsert(slug: string, patch: PersonaPatch): Promise<Persona> {
    const prior = await this.personas.findOne({ where: { businessKey: slug, isCurrent: true } });
    let version = 1;
    if (prior) {
      version = prior.version + 1;
      prior.isCurrent = false;
      await this.personas.save(prior);
    }
    const next = this.personas.create({
      businessKey: slug,
      version,
      isCurrent: true,
      title: patch.title ?? prior?.title ?? slug,
      layer: patch.layer ?? prior?.layer ?? Layer.PLANNING,
      description: patch.description ?? prior?.description ?? '',
      systemPrompt: patch.systemPrompt ?? prior?.systemPrompt ?? '',
      rules: patch.rules ?? prior?.rules ?? [],
      modelTier: patch.modelTier ?? prior?.modelTier ?? 'claude-sonnet',
      temperature: patch.temperature ?? prior?.temperature ?? 0.2,
      ownedByRole: patch.ownedByRole ?? prior?.ownedByRole ?? 'sigma_admin',
      authoredBy: patch.authoredBy ?? null,
    });
    return this.personas.save(next);
  }

  /**
   * Seed the persona table from `backend/src/personas/*.md`. Idempotent: if a
   * row with the same `businessKey` already exists (any version), the seed
   * file is skipped. Wave 1 runs this once at app start; subsequent edits go
   * through `upsert`.
   */
  async seedFromDisk(): Promise<void> {
    const dir = this.resolveSeedDir();
    if (!dir) {
      this.logger.warn('Persona seed directory not found; skipping seedFromDisk()');
      return;
    }
    for (const fileName of readdirSync(dir)) {
      if (!fileName.endsWith('.md')) continue;
      const fullPath = join(dir, fileName);
      if (!statSync(fullPath).isFile()) continue;
      let parsed: SeedFile | null;
      try {
        parsed = this.parseSeedFile(readFileSync(fullPath, 'utf8'));
      } catch (err) {
        this.logger.warn(`Failed to parse persona seed ${fileName}: ${(err as Error).message}`);
        continue;
      }
      if (!parsed) continue;
      const existing = await this.personas.findOne({ where: { businessKey: parsed.slug } });
      if (existing) continue;
      await this.personas.save(
        this.personas.create({
          businessKey: parsed.slug,
          version: 1,
          isCurrent: true,
          title: parsed.title,
          layer: parsed.layer,
          description: parsed.description,
          systemPrompt: parsed.systemPrompt,
          rules: parsed.rules,
          modelTier: parsed.modelTier,
          temperature: parsed.temperature,
          ownedByRole: parsed.ownedByRole,
          authoredBy: 'system',
        }),
      );
      this.logger.log(`Seeded persona ${parsed.slug}`);
    }
  }

  /** Locate the seed directory under `backend/src/personas/`, robust to dist/src. */
  private resolveSeedDir(): string | null {
    const candidates = [
      join(__dirname, '..', '..', 'personas'),
      join(__dirname, '..', '..', '..', 'src', 'personas'),
      join(process.cwd(), 'backend', 'src', 'personas'),
      join(process.cwd(), 'src', 'personas'),
    ];
    for (const c of candidates) {
      if (existsSync(c) && statSync(c).isDirectory()) return c;
    }
    return null;
  }

  /**
   * Minimal YAML front-matter parser tuned for our seed-file shape — we keep
   * it dependency-free because Wave 1 should not add packages. The grammar is
   * `key: value` per line between `---` markers, plus a Markdown body. Body
   * lines are kept verbatim and used as `systemPrompt`.
   */
  private parseSeedFile(raw: string): SeedFile | null {
    const text = raw.replace(/^﻿/, '');
    const m = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/.exec(text);
    if (!m) return null;
    const front: Record<string, string> = {};
    for (const line of m[1].split(/\r?\n/)) {
      const k = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
      if (k) front[k[1]] = k[2].trim();
    }
    const slug = front.slug;
    if (!slug) return null;
    const title = front.title_ar || front.title_en || front.title || slug;
    const layer = (front.layer || 'PLANNING').toLowerCase();
    return {
      slug,
      title,
      layer,
      description: front.description || '',
      systemPrompt: m[2].trim(),
      rules: [],
      modelTier: front.modelTier || 'claude-sonnet',
      temperature: front.temperature ? Number(front.temperature) : 0.2,
      ownedByRole: front.ownedByRole || 'sigma_admin',
    };
  }
}
