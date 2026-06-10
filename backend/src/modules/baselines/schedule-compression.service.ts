import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Activity, Project, Scenario } from '../canonical/entities';
import { ClaudeService } from '../claude/claude.service';

/** One compression technique the proposal recommends. */
export interface CompressionTechnique {
  type: 'crashing' | 'fast-tracking' | 'resequencing';
  title: string;
  affectedActivities: string[];
  estimatedSavingDays: number;
  assumptions: string[];
  tradeoffs: string;
}

/** The day-zero compression proposal (meeting 2026-06-08 @ 00:16:28). */
export interface CompressionProposal {
  projectKey: string;
  scenarioId: string;
  originalDurationDays: number;
  compressedDurationDays: number;
  compressionDays: number;
  compressionPercent: number;
  techniques: CompressionTechnique[];
  risks: string[];
  /** `deterministic` = heuristics only; `llm` = persona-reviewed narrative. */
  source: 'deterministic' | 'llm';
  personaSlug: string | null;
  citations: string[];
}

/** Persona that vets the deterministic candidates (ADR-0010 slug contract). */
export const COMPRESSION_PERSONA_SLUG = 'planner-p6-25yr';

/**
 * ScheduleCompressionService — the day-zero "this schedule can be
 * compressed by X days" analysis Al Ayham asked for on 2026-06-08
 * (00:16:28): «جاني اقتراح جدول زمني — ليش ما يكون في اقتراح للـ AI بأنه
 * هاد الجدول الزمني قادر انه ينضغط، بالزمن زيرو، مو أثناء سير المشروع».
 *
 * Two-stage pipeline, deterministic-first (ADR-0006 boundary):
 *
 *  1. **Heuristic candidate detection** (always runs, no AI):
 *     - *Crashing*: critical-band activities (float ≤ 2 days) with
 *       duration ≥ 10 days → resource intensification typically recovers
 *       ~20% of the duration (rounded down, ≥ 2 days to be worth the
 *       disruption).
 *     - *Fast-tracking*: consecutive critical-band activities inside the
 *       same WBS branch → overlap 25% of the shorter activity (the classic
 *       PMBOK fast-track ratio for low-rework-risk pairs).
 *     - Total claimed compression is capped at 30% of the original
 *       duration — over-compression past that point is the textbook
 *       schedule-quality red flag (AACE 25R-03 territory), so the engine
 *       refuses to promise more even when the arithmetic would allow it.
 *
 *  2. **Persona vetting** (only when Claude is enabled): the deterministic
 *     candidates + schedule slice go to the 25-year planner persona, which
 *     may revise saving estimates downward, drop unsafe pairs, and attach
 *     the risk narrative. The persona may never INCREASE the deterministic
 *     ceiling — the heuristic numbers are the upper bound the platform is
 *     willing to defend. Parse failures fall back to the deterministic
 *     result (never throw away a valid analysis because prose was bad).
 *
 * Every proposal persists as a Scenario row (kind `compression-proposal`)
 * so the /baselines card can re-render it without recompute and the
 * eventual "apply" cycle has an audit anchor.
 */
@Injectable()
export class ScheduleCompressionService {
  private readonly logger = new Logger(ScheduleCompressionService.name);

  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
    @InjectRepository(Scenario) private readonly scenarios: Repository<Scenario>,
    @Optional() private readonly claude?: ClaudeService,
  ) {}

  /** Analyse the current schedule and propose compression. */
  async proposeCompression(projectKey: string, requestedBy: string | null): Promise<CompressionProposal> {
    if (!projectKey) throw new BadRequestException('projectKey is required');
    const project = await this.projects.findOne({
      where: { businessKey: projectKey, isCurrent: true },
    });
    if (!project) throw new NotFoundException(`No current project with businessKey "${projectKey}"`);

    const rows = await this.activities.find({
      where: { projectId: project.id, isCurrent: true },
    });
    const dated = rows.filter((a) => a.plannedStart && a.plannedFinish);
    if (dated.length < 5) {
      throw new BadRequestException(
        `Schedule has only ${dated.length} dated activities — compression analysis needs at least 5.`,
      );
    }

    const projectStart = dated.map((a) => a.plannedStart!).reduce((m, x) => (x < m ? x : m));
    const projectFinish = dated.map((a) => a.plannedFinish!).reduce((m, x) => (x > m ? x : m));
    const originalDurationDays = daysBetween(projectStart, projectFinish) + 1;

    // ── Stage 1: deterministic candidates ──
    const techniques = this.detectCandidates(dated, projectFinish);
    const rawSaving = techniques.reduce((acc, t) => acc + t.estimatedSavingDays, 0);
    const cap = Math.floor(originalDurationDays * 0.3);
    const compressionDays = Math.min(rawSaving, cap);
    const risks: string[] = [
      'Compression estimates assume resources can be intensified without site congestion.',
      'Fast-tracked pairs carry rework risk if the predecessor output changes late.',
    ];
    if (rawSaving > cap) {
      risks.push(
        `Raw technique savings (${rawSaving}d) exceed the 30% over-compression guard — claim capped at ${cap}d.`,
      );
    }

    let source: 'deterministic' | 'llm' = 'deterministic';
    let personaSlug: string | null = null;
    let citations: string[] = [];
    let vettedTechniques = techniques;
    let vettedCompression = compressionDays;
    let vettedRisks = risks;

    // ── Stage 2: persona vetting (optional) ──
    if (this.claude?.isEnabled()) {
      try {
        const vetted = await this.vetWithPersona(
          projectKey,
          originalDurationDays,
          techniques,
          compressionDays,
        );
        if (vetted) {
          vettedTechniques = vetted.techniques;
          vettedCompression = Math.min(vetted.compressionDays, compressionDays); // never exceed ceiling
          vettedRisks = vetted.risks.length > 0 ? vetted.risks : risks;
          source = 'llm';
          personaSlug = COMPRESSION_PERSONA_SLUG;
          citations = vetted.citations;
        }
      } catch (err) {
        this.logger.warn(
          `Persona vetting failed (${(err as Error).message}) — returning deterministic proposal.`,
        );
      }
    }

    const compressedDurationDays = originalDurationDays - vettedCompression;
    const scenario = await this.scenarios.save(
      this.scenarios.create({
        projectBusinessKey: projectKey,
        name: `Compression proposal — ${vettedCompression}d`,
        authorUserId: null,
        authorDisplay: requestedBy,
        status: 'open',
        forkedFromAt: new Date(),
        summary:
          `Day-zero compression analysis: ${originalDurationDays}d → ${compressedDurationDays}d ` +
          `(−${vettedCompression}d, ${Math.round((vettedCompression / originalDurationDays) * 100)}%) ` +
          `via ${vettedTechniques.length} technique(s). Source: ${source}.`,
        baselineSnapshot: {
          kind: 'compression-proposal',
          originalDurationDays,
          compressedDurationDays,
          compressionDays: vettedCompression,
          techniques: vettedTechniques,
          risks: vettedRisks,
          source,
        },
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }),
    );

    this.logger.log(
      `Compression proposal for ${projectKey}: −${vettedCompression}d of ${originalDurationDays}d ` +
        `(${vettedTechniques.length} technique(s), source=${source}, scenario=${scenario.id})`,
    );

    return {
      projectKey,
      scenarioId: scenario.id,
      originalDurationDays,
      compressedDurationDays,
      compressionDays: vettedCompression,
      compressionPercent: Math.round((vettedCompression / originalDurationDays) * 100),
      techniques: vettedTechniques,
      risks: vettedRisks,
      source,
      personaSlug,
      citations,
    };
  }

  // ───────────────────────── internals ─────────────────────────

  /** Heuristic crashing + fast-tracking detection (see class doc). */
  private detectCandidates(dated: Activity[], projectFinish: string): CompressionTechnique[] {
    const out: CompressionTechnique[] = [];
    const CRITICAL_BAND_DAYS = 2;
    const critical = dated.filter(
      (a) => daysBetween(a.plannedFinish!, projectFinish) <= CRITICAL_BAND_DAYS,
    );

    // Crashing: long critical activities.
    const crashable = critical.filter((a) => (a.plannedDurationDays ?? 0) >= 10);
    for (const a of crashable.slice(0, 5)) {
      const saving = Math.max(2, Math.floor((a.plannedDurationDays ?? 0) * 0.2));
      out.push({
        type: 'crashing',
        title: `Crash "${a.name}" with additional crews`,
        affectedActivities: [a.businessKey],
        estimatedSavingDays: saving,
        assumptions: [
          `Second crew / extended shift available for the full ${a.plannedDurationDays}d window.`,
          'No spatial congestion with parallel trades in the same zone.',
        ],
        tradeoffs: 'Direct cost rises with the added resources; quality supervision load doubles.',
      });
    }

    // Fast-tracking: consecutive critical activities in the same WBS branch.
    const byWbs = new Map<string, Activity[]>();
    for (const a of critical) {
      const key = a.wbsCode ?? '_';
      if (!byWbs.has(key)) byWbs.set(key, []);
      byWbs.get(key)!.push(a);
    }
    for (const [wbs, list] of byWbs) {
      if (wbs === '_' || list.length < 2) continue;
      const sorted = [...list].sort((x, y) => (x.plannedStart! < y.plannedStart! ? -1 : 1));
      for (let i = 1; i < Math.min(sorted.length, 4); i += 1) {
        const prev = sorted[i - 1];
        const next = sorted[i];
        const shorter = Math.min(prev.plannedDurationDays ?? 0, next.plannedDurationDays ?? 0);
        if (shorter < 5) continue;
        const overlap = Math.floor(shorter * 0.25);
        if (overlap < 2) continue;
        out.push({
          type: 'fast-tracking',
          title: `Fast-track "${next.name}" to overlap "${prev.name}"`,
          affectedActivities: [prev.businessKey, next.businessKey],
          estimatedSavingDays: overlap,
          assumptions: [
            `The first ${overlap}d of "${next.name}" do not depend on the final output of "${prev.name}".`,
          ],
          tradeoffs: 'Rework exposure if the predecessor changes late; tighter coordination needed.',
        });
      }
    }

    return out;
  }

  /** Send the candidates to the planner persona for vetting (never raises the ceiling). */
  private async vetWithPersona(
    projectKey: string,
    originalDurationDays: number,
    candidates: CompressionTechnique[],
    deterministicCeiling: number,
  ): Promise<{ techniques: CompressionTechnique[]; compressionDays: number; risks: string[]; citations: string[] } | null> {
    if (!this.claude) return null;
    const result = await this.claude.callPersona(
      COMPRESSION_PERSONA_SLUG,
      `Review these schedule-compression candidates for project ${projectKey} ` +
        `(original duration ${originalDurationDays} days; deterministic ceiling ${deterministicCeiling} days). ` +
        `Drop unsafe pairs, revise savings DOWNWARD where optimistic, and attach risks. ` +
        `Return strict JSON: { "compressionDays": n, "techniques": [same shape as input], "risks": ["…"] } — no fences, no prose.`,
      { context: JSON.stringify({ candidates }, null, 2) },
    );
    const unfenced = result.content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/m, '')
      .trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(unfenced);
    } catch {
      return null; // deterministic fallback — never lose the analysis over bad prose
    }
    const obj = parsed as {
      compressionDays?: unknown;
      techniques?: unknown;
      risks?: unknown;
    };
    if (!Array.isArray(obj.techniques)) return null;
    const techniques = (obj.techniques as CompressionTechnique[]).filter(
      (t) => t && typeof t.title === 'string' && Array.isArray(t.affectedActivities),
    );
    const compressionDays =
      typeof obj.compressionDays === 'number' && Number.isFinite(obj.compressionDays)
        ? Math.max(0, Math.round(obj.compressionDays))
        : techniques.reduce((acc, t) => acc + (t.estimatedSavingDays ?? 0), 0);
    const risks = Array.isArray(obj.risks) ? (obj.risks as string[]).filter((r) => typeof r === 'string') : [];
    return { techniques, compressionDays, risks, citations: result.citations };
  }
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(`${aIso}T00:00:00Z`);
  const b = new Date(`${bIso}T00:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
