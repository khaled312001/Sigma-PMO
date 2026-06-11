import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import {
  GovernancePolicy,
  LessonsLearned,
  ProjectMemory,
  Source,
} from '../canonical/entities';
import {
  ASSUMPTION_LIBRARY_VERSION,
  LOCATION_FACTORS,
  PROJECT_TYPE_ASSUMPTIONS,
} from '../feasibility/assumption-library';
import { RuleCatalogEntry, SIGMA_RULE_LIBRARY } from './rule-catalog';

/** One hit in the unified L0 keyword search result list. */
export interface KnowledgeSearchHit {
  /** Which knowledge asset the hit came from. */
  kind: 'rule' | 'source' | 'framework' | 'lesson';
  /** Stable identifier — rule code, source externalId, or row id. */
  id: string;
  title: string;
  /** A short context snippet around the match. */
  snippet: string;
}

/**
 * The unified L0 keyword-search response. The `retrievalMode`/`roadmap` fields
 * are an honesty contract: this is a deterministic LIKE/substring matcher
 * (`keyword-v1`), NOT semantic retrieval. The RAG-embeddings upgrade is on the
 * roadmap; until it ships, callers must not present results as semantic.
 */
export interface KnowledgeSearchResponse {
  query: string;
  retrievalMode: 'keyword-v1';
  roadmap: 'RAG embeddings';
  total: number;
  hits: KnowledgeSearchHit[];
}

/** Per-project-type cost/return benchmark, flattened for the catalog view. */
export interface BenchmarkTypeEntry {
  type: string;
  label: string;
  costPerSqmBua: number;
  annualRevenueYieldPct: number;
  opexPctOfRevenue: number;
  hurdleIrrPct: number;
  terminalValueMultiple: number;
  sectorRiskScore: number;
}

/** A reference-taxonomy family (FIDIC / PMI / etc.) and its source rows. */
export interface ReferenceTaxonomy {
  family: string;
  sources: { externalId: string; title: string; year: number; verification: string }[];
}

/**
 * A focused knowledge pack handed to an agent for one node — the L0 Knowledge
 * & Rules Engine's primary service to the other layers.
 */
export interface KnowledgePack {
  layer: string;
  ruleReferences: RuleCatalogEntry[];
  sourceIds: string[];
  lessons: { title: string; content: string; category: string }[];
}

/**
 * KnowledgeService — the L0 Knowledge & Rules Engine facade (Mr. Ayham's
 * Layer 0). Unifies the platform's reference assets so every intelligence
 * layer references ONE engine when reasoning:
 *  - Sigma Rule Library  → {@link SIGMA_RULE_LIBRARY}
 *  - Standards (FIDIC/PMI/ISO/AACE) → curated `Source` registry
 *  - Governance frameworks / SOPs → `GovernancePolicy` rows
 *  - Lessons Learned → `LessonsLearned` rows (extensible to new standards)
 *  - Learned project facts → `ProjectMemory`
 */
@Injectable()
export class KnowledgeService {
  constructor(
    @InjectRepository(Source) private readonly sources: Repository<Source>,
    @InjectRepository(GovernancePolicy) private readonly policies: Repository<GovernancePolicy>,
    @InjectRepository(ProjectMemory) private readonly memory: Repository<ProjectMemory>,
    @InjectRepository(LessonsLearned) private readonly lessons: Repository<LessonsLearned>,
  ) {}

  /** The Sigma Rule Library (deterministic rule definitions). */
  rules(): RuleCatalogEntry[] {
    return SIGMA_RULE_LIBRARY;
  }

  /** The curated standards/references catalogue (FIDIC, PMI, ISO, AACE, …). */
  listSources(): Promise<Source[]> {
    return this.sources.find({ order: { createdAt: 'ASC' } });
  }

  /** Governance frameworks / SOPs encoded as versioned policy rows. */
  listFrameworks(projectKey?: string): Promise<GovernancePolicy[]> {
    if (projectKey) {
      return this.policies.find({ where: { projectKey, isCurrent: true } });
    }
    return this.policies.find({ where: { isCurrent: true } });
  }

  // ───────────────────────── Lessons Learned ─────────────────────────

  listLessons(projectKey?: string): Promise<LessonsLearned[]> {
    if (projectKey) {
      return this.lessons.find({
        where: [
          { projectBusinessKey: projectKey, isActive: true },
          { projectBusinessKey: IsNull(), isActive: true },
        ],
        order: { createdAt: 'DESC' },
      });
    }
    return this.lessons.find({ where: { isActive: true }, order: { createdAt: 'DESC' } });
  }

  recordLesson(input: {
    title: string; content: string; category: string;
    standardRef?: string | null; projectBusinessKey?: string | null;
    appliesToLayers?: string[]; recordedBy?: string | null;
  }): Promise<LessonsLearned> {
    if (!input.title?.trim() || !input.content?.trim()) {
      throw new BadRequestException('title and content are required');
    }
    return this.lessons.save(
      this.lessons.create({
        title: input.title.trim(),
        content: input.content.trim(),
        category: (input.category || 'governance').trim(),
        standardRef: input.standardRef ?? null,
        projectBusinessKey: input.projectBusinessKey ?? null,
        appliesToLayers: input.appliesToLayers ?? [],
        recordedBy: input.recordedBy ?? null,
        isActive: true,
      }),
    );
  }

  async deactivateLesson(id: string): Promise<LessonsLearned> {
    const row = await this.lessons.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`No lesson with id ${id}`);
    row.isActive = false;
    return this.lessons.save(row);
  }

  // ───────────────────────── Knowledge pack (for agents) ─────────────────────────

  /**
   * The bundle an agent references when reasoning over a node — its layer's
   * rule library slice + curated source ids + the lessons that inform it.
   */
  async getKnowledgePack(layer: string, projectKey?: string): Promise<KnowledgePack> {
    const [sources, lessons, mem] = await Promise.all([
      this.sources.find({ take: 200 }),
      this.listLessons(projectKey),
      projectKey
        ? this.memory.find({ where: { projectBusinessKey: projectKey, isActive: true } })
        : Promise.resolve([]),
    ]);
    return {
      layer,
      ruleReferences: SIGMA_RULE_LIBRARY,
      sourceIds: sources.map((s) => s.externalId),
      lessons: [
        ...lessons
          .filter((l) => l.appliesToLayers.length === 0 || l.appliesToLayers.includes(layer))
          .map((l) => ({ title: l.title, content: l.content, category: l.category })),
        ...mem.map((m) => ({ title: `memory:${m.factType}`, content: m.content, category: 'project-memory' })),
      ],
    };
  }

  // ───────────────────────── L0 keyword search ─────────────────────────

  /**
   * Unified keyword search across the L0 knowledge assets (mission §3):
   *  - the Sigma Rule Library (code / title / description),
   *  - the curated `Source` registry (title / externalId),
   *  - GovernancePolicy frameworks (authoredBy / project scope / config JSON),
   *  - the Lessons Learned repository (title / content).
   *
   * Deterministic keyword-v1 retrieval: case-insensitive substring/LIKE only.
   * NOT semantic — the RAG-embeddings upgrade is on the roadmap (see the
   * `retrievalMode`/`roadmap` honesty fields on the response).
   */
  async search(q: string): Promise<KnowledgeSearchResponse> {
    const term = (q ?? '').trim();
    if (!term) {
      return { query: '', retrievalMode: 'keyword-v1', roadmap: 'RAG embeddings', total: 0, hits: [] };
    }
    const needle = term.toLowerCase();
    const hits: KnowledgeSearchHit[] = [];

    // 1) Rule catalogue (in-memory — small, no DB round-trip).
    for (const r of SIGMA_RULE_LIBRARY) {
      const hay = `${r.code} ${r.title} ${r.description}`.toLowerCase();
      if (hay.includes(needle)) {
        hits.push({ kind: 'rule', id: r.code, title: r.title, snippet: this.snip(r.description, needle) });
      }
    }

    // 2) Sources — LIKE across title + externalId.
    const like = `%${term}%`;
    const [sourceRows, policyRows, lessonRows] = await Promise.all([
      this.sources
        .createQueryBuilder('s')
        .where('s.title LIKE :like', { like })
        .orWhere('s.externalId LIKE :like', { like })
        .orderBy('s.year', 'DESC')
        .take(25)
        .getMany(),
      this.policies.find({ where: { isCurrent: true } }),
      this.lessons
        .createQueryBuilder('l')
        .where('l.isActive = :a', { a: true })
        .andWhere('(l.title LIKE :like OR l.content LIKE :like)', { like })
        .orderBy('l.createdAt', 'DESC')
        .take(25)
        .getMany(),
    ]);

    for (const s of sourceRows) {
      hits.push({ kind: 'source', id: s.externalId, title: s.title, snippet: this.snip(s.scope, needle) });
    }

    // 3) Governance frameworks — the config is JSON; stringify to match.
    for (const p of policyRows) {
      const hay = `${p.authoredBy ?? ''} ${p.projectKey ?? 'global'} ${JSON.stringify(p.config ?? {})}`.toLowerCase();
      if (hay.includes(needle)) {
        hits.push({
          kind: 'framework',
          id: p.id,
          title: `${p.projectKey ? `Project ${p.projectKey}` : 'Global'} governance policy v${p.version}`,
          snippet: this.snip(JSON.stringify(p.config ?? {}), needle),
        });
      }
    }

    // 4) Lessons learned.
    for (const l of lessonRows) {
      hits.push({ kind: 'lesson', id: l.id, title: l.title, snippet: this.snip(l.content, needle) });
    }

    return {
      query: term,
      retrievalMode: 'keyword-v1',
      roadmap: 'RAG embeddings',
      total: hits.length,
      hits: hits.slice(0, 60),
    };
  }

  // ───────────────────────── Industry benchmarks ─────────────────────────

  /**
   * Expose the deterministic industry benchmarks (mission §3) the feasibility
   * engine reasons against — read-only re-shape of the Assumption Library
   * (cost/sqm BUA, yields, returns) + the location cost/market factors +
   * reference standards taxonomies (FIDIC / PMI / Regulatory) sourced from the
   * curated `Source` registry. Snapshotting these onto assessments keeps
   * history immutable — this endpoint is the live catalog view.
   */
  async benchmarks(): Promise<{
    version: string;
    costBenchmarks: BenchmarkTypeEntry[];
    locationFactors: { location: string; costFactor: number; marketStrength: number; countryRisk: number }[];
    referenceTaxonomies: ReferenceTaxonomy[];
  }> {
    const costBenchmarks: BenchmarkTypeEntry[] = Object.entries(PROJECT_TYPE_ASSUMPTIONS).map(
      ([type, a]) => ({
        type,
        label: a.label,
        costPerSqmBua: a.costPerSqmBua,
        annualRevenueYieldPct: a.annualRevenueYieldPct,
        opexPctOfRevenue: a.opexPctOfRevenue,
        hurdleIrrPct: a.hurdleIrrPct,
        terminalValueMultiple: a.terminalValueMultiple,
        sectorRiskScore: a.sectorRiskScore,
      }),
    );

    const locationFactors = Object.entries(LOCATION_FACTORS).map(([location, f]) => ({
      location,
      costFactor: f.costFactor,
      marketStrength: f.marketStrength,
      countryRisk: f.countryRisk,
    }));

    // Reference taxonomies: FIDIC (contract), PMI (PM body of knowledge), and a
    // Regulatory bucket (ISO/AACE governance standards). Sourced from the
    // curated Source registry, grouped by family.
    const allSources = await this.sources.find({ order: { year: 'DESC' } });
    const taxonomyFamilies: Record<string, string[]> = {
      FIDIC: ['FIDIC'],
      PMI: ['PMI'],
      Regulatory: ['ISO', 'AACE', 'BIM', 'PRIMAVERA'],
    };
    const referenceTaxonomies: ReferenceTaxonomy[] = Object.entries(taxonomyFamilies).map(
      ([family, members]) => ({
        family,
        sources: allSources
          .filter((s) => members.includes(s.family))
          .map((s) => ({
            externalId: s.externalId,
            title: s.title,
            year: s.year,
            verification: s.verification,
          })),
      }),
    );

    return {
      version: ASSUMPTION_LIBRARY_VERSION,
      costBenchmarks,
      locationFactors,
      referenceTaxonomies,
    };
  }

  /** Build a short snippet centred on the first occurrence of `needle`. */
  private snip(text: string | null | undefined, needle: string): string {
    const s = (text ?? '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    const idx = s.toLowerCase().indexOf(needle);
    if (idx < 0) return s.slice(0, 160);
    const start = Math.max(0, idx - 60);
    const end = Math.min(s.length, idx + needle.length + 100);
    return `${start > 0 ? '…' : ''}${s.slice(start, end)}${end < s.length ? '…' : ''}`;
  }
}
