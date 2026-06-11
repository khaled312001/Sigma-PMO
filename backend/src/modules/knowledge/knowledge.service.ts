import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import {
  GovernancePolicy,
  LessonsLearned,
  ProjectMemory,
  Source,
} from '../canonical/entities';
import { RuleCatalogEntry, SIGMA_RULE_LIBRARY } from './rule-catalog';

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
}
