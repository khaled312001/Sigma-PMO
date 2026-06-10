import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Alert, GovernanceDecision, Project, ProjectMemory } from '../canonical/entities';

/** Facts below this confidence never reach a prompt. */
export const PROMPT_CONFIDENCE_FLOOR = 0.6;

/**
 * ProjectMemoryService — the project "understudy" memory (correction-plan
 * §2.11; meeting 2026-06-08 @ 00:22:33).
 *
 * Two halves:
 *
 *  1. **CRUD** — team members record facts directly (`source: user-input`,
 *     confidence 1.0); wrong facts get deactivated, never erased.
 *
 *  2. **Harvester** — `harvest(projectKey)` derives facts from the alert +
 *     decision pattern with honest confidences:
 *       - a rule code firing ≥ 3 times → "recurring <code> pattern" (0.7)
 *       - ≥ 2 critical alerts open      → "critical-prone period" (0.65)
 *       - ≥ 3 L1 escalations            → "escalation-heavy governance" (0.7)
 *     Harvested facts are idempotent per (projectKey, content): re-running
 *     refreshes nothing if the fact already exists and is active.
 *
 * `buildPromptBlock` is the injection point the Claude prompt builder
 * calls — only facts with confidence ≥ {@link PROMPT_CONFIDENCE_FLOOR}
 * ship, newest first, capped at 12 lines so memory never crowds out the
 * task context.
 */
@Injectable()
export class ProjectMemoryService {
  private readonly logger = new Logger(ProjectMemoryService.name);

  constructor(
    @InjectRepository(ProjectMemory) private readonly memories: Repository<ProjectMemory>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(GovernanceDecision)
    private readonly decisions: Repository<GovernanceDecision>,
  ) {}

  /** Active facts, newest first. */
  list(projectBusinessKey: string): Promise<ProjectMemory[]> {
    if (!projectBusinessKey) throw new BadRequestException('projectKey is required');
    return this.memories.find({
      where: { projectBusinessKey, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  /** Record a fact directly (user input → confidence 1.0). */
  async record(input: {
    projectBusinessKey: string;
    factType: string;
    content: string;
    recordedBy: string | null;
  }): Promise<ProjectMemory> {
    if (!input.content?.trim()) throw new BadRequestException('content is required');
    if (input.content.length > 1000) throw new BadRequestException('content too long (max 1000)');
    const row = await this.memories.save(
      this.memories.create({
        projectBusinessKey: input.projectBusinessKey,
        factType: input.factType || 'characteristic',
        content: input.content.trim(),
        source: 'user-input',
        confidence: 1.0,
        recordedBy: input.recordedBy,
        isActive: true,
      }),
    );
    this.logger.log(`Memory recorded for ${input.projectBusinessKey}: "${input.content.slice(0, 60)}…"`);
    return row;
  }

  /** Deactivate a wrong fact (audit row survives). */
  async deactivate(id: string): Promise<ProjectMemory> {
    const row = await this.memories.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`No memory with id ${id}`);
    row.isActive = false;
    return this.memories.save(row);
  }

  /**
   * Derive facts from the alert + decision history. Idempotent on
   * (projectKey, content). Returns the facts created THIS run.
   */
  async harvest(projectBusinessKey: string): Promise<ProjectMemory[]> {
    const versionIds = (
      await this.projects.find({ where: { businessKey: projectBusinessKey }, select: { id: true } })
    ).map((p) => p.id);
    if (versionIds.length === 0) {
      throw new NotFoundException(`No project rows for businessKey "${projectBusinessKey}"`);
    }
    const [alerts, decisions] = await Promise.all([
      this.alerts.find({ where: { projectId: In(versionIds) }, take: 1000 }),
      this.decisions.find({ take: 1000 }),
    ]);

    const candidates: Array<{ factType: string; content: string; confidence: number }> = [];

    // Recurring rule codes.
    const byCode = new Map<string, number>();
    for (const a of alerts) byCode.set(a.code, (byCode.get(a.code) ?? 0) + 1);
    for (const [code, n] of byCode) {
      if (n >= 3) {
        candidates.push({
          factType: 'risk',
          content: `Recurring ${code} pattern — fired ${n} times in this project's history. Weight new proposals against it.`,
          confidence: 0.7,
        });
      }
    }
    // Critical-prone.
    const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
    if (criticalCount >= 2) {
      candidates.push({
        factType: 'characteristic',
        content: `Critical-prone project: ${criticalCount} critical alerts in history. Prefer conservative duration and cost assumptions.`,
        confidence: 0.65,
      });
    }
    // Escalation-heavy.
    const l1 = decisions.filter((d) => d.escalationLevel === 'L1').length;
    if (l1 >= 3) {
      candidates.push({
        factType: 'history',
        content: `Escalation-heavy governance: ${l1} L1 decisions on record. Flag decision-owner assignment explicitly in every recommendation.`,
        confidence: 0.7,
      });
    }

    // Idempotent insert.
    const existing = await this.memories.find({
      where: { projectBusinessKey, isActive: true },
    });
    const created: ProjectMemory[] = [];
    for (const c of candidates) {
      if (existing.some((e) => e.content === c.content)) continue;
      created.push(
        await this.memories.save(
          this.memories.create({
            projectBusinessKey,
            factType: c.factType,
            content: c.content,
            source: 'inferred',
            confidence: c.confidence,
            recordedBy: null,
            isActive: true,
          }),
        ),
      );
    }
    this.logger.log(
      `Memory harvest for ${projectBusinessKey}: ${candidates.length} candidate(s), ${created.length} new.`,
    );
    return created;
  }

  /**
   * Prompt block for the Claude builder — '' when nothing qualifies.
   * Only confidence ≥ 0.6, capped at 12 lines.
   */
  async buildPromptBlock(projectBusinessKey: string): Promise<string> {
    const rows = await this.memories.find({
      where: { projectBusinessKey, isActive: true },
      order: { createdAt: 'DESC' },
    });
    const qualified = rows.filter((r) => r.confidence >= PROMPT_CONFIDENCE_FLOOR).slice(0, 12);
    if (qualified.length === 0) return '';
    const lines = qualified
      .map((r) => `- [${r.factType}] ${r.content} (confidence ${r.confidence.toFixed(2)}, ${r.source})`)
      .join('\n');
    return `\n\n# Known about this project (${projectBusinessKey})\n${lines}`;
  }
}
