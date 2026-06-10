import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ProjectPolicyAddon } from '../canonical/entities';

/** Surfaces an addon may target. `*` applies everywhere. */
export const ADDON_SURFACES = ['planning', 'engineering', 'governance', 'reports', '*'] as const;
export type AddonSurface = (typeof ADDON_SURFACES)[number];

/**
 * PolicyAddonsService — CRUD + prompt-block builder for project-scoped AI
 * instructions (correction-plan §2.6).
 *
 * Lives in its own module (not GovernanceModule) so `ClaudeModule` can
 * import it without a dependency cycle: claude → policy-addons → canonical.
 *
 * Edit = deactivate + insert (append-only audit); `buildPromptBlock` is the
 * single composition point the Claude prompt builder calls.
 */
@Injectable()
export class PolicyAddonsService {
  private readonly logger = new Logger(PolicyAddonsService.name);

  constructor(
    @InjectRepository(ProjectPolicyAddon)
    private readonly addons: Repository<ProjectPolicyAddon>,
  ) {}

  /** Active addons for one project, optionally narrowed to one surface (plus `*`). */
  async listActive(projectBusinessKey: string, surface?: string): Promise<ProjectPolicyAddon[]> {
    if (!projectBusinessKey) throw new BadRequestException('projectKey is required');
    const all = await this.addons.find({
      where: { projectBusinessKey, isActive: true },
      order: { createdAt: 'ASC' },
    });
    if (!surface) return all;
    return all.filter((a) => a.surface === surface || a.surface === '*');
  }

  /** Create one addon. */
  async create(input: {
    projectBusinessKey: string;
    surface: string;
    content: string;
    authoredBy: string | null;
    authoredByRole: string | null;
  }): Promise<ProjectPolicyAddon> {
    if (!input.projectBusinessKey) throw new BadRequestException('projectKey is required');
    if (!input.content?.trim()) throw new BadRequestException('content is required');
    if (input.content.length > 2000) {
      throw new BadRequestException('content too long (max 2000 chars) — split into multiple bullets');
    }
    if (!ADDON_SURFACES.includes(input.surface as AddonSurface)) {
      throw new BadRequestException(`surface must be one of: ${ADDON_SURFACES.join(', ')}`);
    }
    const row = await this.addons.save(
      this.addons.create({
        projectBusinessKey: input.projectBusinessKey,
        surface: input.surface,
        content: input.content.trim(),
        authoredBy: input.authoredBy,
        authoredByRole: input.authoredByRole,
        isActive: true,
      }),
    );
    this.logger.log(
      `Policy addon ${row.id} created for ${input.projectBusinessKey}/${input.surface} by ${input.authoredBy ?? 'unknown'}`,
    );
    return row;
  }

  /** Soft-delete (audit rows survive). */
  async deactivate(id: string, by: string | null): Promise<ProjectPolicyAddon> {
    const row = await this.addons.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`No policy addon with id ${id}`);
    row.isActive = false;
    const saved = await this.addons.save(row);
    this.logger.log(`Policy addon ${id} deactivated by ${by ?? 'unknown'}`);
    return saved;
  }

  /**
   * Compose the prompt block the Claude request appends after the persona
   * system prompt. Empty string when no addons match — callers concatenate
   * unconditionally.
   */
  async buildPromptBlock(projectBusinessKey: string, surface: string): Promise<string> {
    const rows = await this.listActive(projectBusinessKey, surface);
    if (rows.length === 0) return '';
    const bullets = rows
      .map((a, i) => `${i + 1}. ${a.content}${a.authoredBy ? ` — (${a.authoredBy})` : ''}`)
      .join('\n');
    return (
      `\n\n# Project-specific instructions for ${projectBusinessKey} (surface: ${surface})\n` +
      `These override the global policy where they conflict. Authored by the project team:\n` +
      bullets
    );
  }
}
