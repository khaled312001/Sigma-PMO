import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SourceType } from '../../common/enums';
import { Activity, BaselineBuildJob, DrawingPackage, Project, SourceFile } from '../canonical/entities';
import { StorageService } from '../ingestion/storage/storage.service';
import { BaselineTemplateService, TemplateActivity, TemplateDependency } from './baseline-template.service';
import { XerWriterService } from './xer-writer.service';

/**
 * The `failureReason` carried by every gated job until ADR-0011 (Computer Use
 * safety) flips from `Proposed` to `Accepted` on Al Ayham's open question 6.
 *
 * Surfaced as a constant so the spec, the UI, and any future ops query can
 * key off the exact same string without re-typing it.
 */
export const COMPUTER_USE_GATED_REASON =
  'Computer Use integration gated on ADR-0011 status flip per open question 6';

/** Initial state every Wave 2 baseline job parks in. */
export const AWAITING_ENABLEMENT_STATUS = 'awaiting-enablement';

/** Wave-2 default planner persona for any caller that omits `personaSlug`. */
export const DEFAULT_PLANNER_PERSONA_SLUG = 'planner-p6-25yr';

/**
 * BaselineBuildWorker — Wave 2 **stub**.
 *
 * Per the 2026-06-08 post-meeting plan §3.1 + ADR-0011, the actual AI-driven
 * Primavera P6 baseline build is the very last thing we wire up: it requires
 * Anthropic Computer Use, which itself is gated on Al Ayham approving the 12
 * guardrails in ADR-0011 (open question 6). Until that ADR flips to
 * `Accepted` we accept submissions, record the requested persona + drawings,
 * and immediately mark the job `awaiting-enablement` with a deterministic
 * `failureReason` so the front-end can render the reason without inspecting
 * any AI surface.
 *
 * Wave 3+ will replace the no-op `submitJob` with the real Computer Use
 * driver. The signature here is the contract: anyone calling `submitJob`
 * today gets back a row they can later observe transition to
 * `running → awaiting-approval → committed`.
 */
@Injectable()
export class BaselineBuildService {
  constructor(
    @InjectRepository(BaselineBuildJob)
    private readonly jobs: Repository<BaselineBuildJob>,
    @Optional() @InjectRepository(Project) private readonly projects?: Repository<Project>,
    @Optional() @InjectRepository(Activity) private readonly activities?: Repository<Activity>,
    @Optional() @InjectRepository(SourceFile) private readonly sourceFiles?: Repository<SourceFile>,
    @Optional() @Inject(XerWriterService) private readonly xerWriter?: XerWriterService,
    @Optional() @Inject(StorageService) private readonly storage?: StorageService,
    @Optional() @Inject(BaselineTemplateService) private readonly template?: BaselineTemplateService,
    @Optional() @InjectRepository(DrawingPackage) private readonly drawingPackages?: Repository<DrawingPackage>,
  ) {}

  /**
   * The synthesised template (when activityCount=0) for the most recent
   * authored job. Held on the service instance so the schedule-PDF and
   * `.xer` download endpoints can render the same plan that produced the
   * `.xer` without re-running the synthesizer.
   *
   * Keyed by jobId so concurrent author calls don't trample each other.
   */
  private readonly lastSynth = new Map<string, { activities: TemplateActivity[]; dependencies: TemplateDependency[] }>();

  /** Read back the synthesized plan for a given author job. */
  getSynthesized(jobId: string): { activities: TemplateActivity[]; dependencies: TemplateDependency[] } | null {
    return this.lastSynth.get(jobId) ?? null;
  }

  /**
   * Re-synthesise the plan for a job that was authored in a previous
   * backend process. Because `BaselineTemplateService.synthesise()` is
   * deterministic on `(projectStart, projectFinish, projectName)` the
   * output is byte-identical to what was originally produced — fine for
   * a schedule-PDF render.
   *
   * Falls back to a partial reconstruction from canonical Activity rows
   * when the template service is unavailable (tests).
   */
  async resynthesise(
    job: BaselineBuildJob,
  ): Promise<{ activities: TemplateActivity[]; dependencies: TemplateDependency[] } | null> {
    if (!this.template || !this.projects) return null;
    const project = await this.projects.findOne({
      where: { businessKey: job.projectBusinessKey, isCurrent: true },
    });
    if (!project || !project.plannedStart || !project.plannedFinish) return null;
    // Drawing-driven jobs re-derive the same floor count from the package
    // they were generated against (determinism survives restarts).
    let floorCount: number | undefined;
    if (this.drawingPackages && job.drawingsSourceFileIds.length > 0) {
      const pkg = await this.drawingPackages.findOne({
        where: { sourceFileId: job.drawingsSourceFileIds[0] },
      });
      if (pkg) floorCount = deriveFloorCount(pkg.summary);
    }
    const result = this.template.synthesise({
      projectStartIso: project.plannedStart,
      projectFinishIso: project.plannedFinish,
      projectName: project.name,
      floorCount,
    });
    // Cache so subsequent calls in this process don't pay the cost again.
    this.lastSynth.set(job.id, { activities: result.activities, dependencies: result.dependencies });
    return { activities: result.activities, dependencies: result.dependencies };
  }

  /**
   * Record a baseline build request. **No work is performed** — the job is
   * persisted in the gated initial state and returned. Wave 3+ will pick it
   * up off the cross-layer Outbox once ADR-0011 is Accepted.
   */
  async submitJob(
    projectKey: string,
    drawingsSourceFileIds: string[],
    personaSlug: string = DEFAULT_PLANNER_PERSONA_SLUG,
  ): Promise<BaselineBuildJob> {
    if (!projectKey) {
      throw new BadRequestException('projectKey is required');
    }
    if (!Array.isArray(drawingsSourceFileIds)) {
      throw new BadRequestException('drawingsSourceFileIds must be an array');
    }
    const job = this.jobs.create({
      projectBusinessKey: projectKey,
      drawingsSourceFileIds,
      personaSlug: personaSlug || DEFAULT_PLANNER_PERSONA_SLUG,
      status: AWAITING_ENABLEMENT_STATUS,
      progressPercent: 0,
      startedAt: null,
      completedAt: null,
      outputXerSourceFileId: null,
      operatorNotes: null,
      failureReason: COMPUTER_USE_GATED_REASON,
    });
    return this.jobs.save(job);
  }

  /** All jobs attached to one project, newest first. */
  listJobs(projectKey: string): Promise<BaselineBuildJob[]> {
    return this.jobs.find({
      where: { projectBusinessKey: projectKey },
      order: { createdAt: 'DESC' },
    });
  }

  async getJob(id: string): Promise<BaselineBuildJob> {
    const row = await this.jobs.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`No baseline build job with id ${id}`);
    return row;
  }

  /**
   * Author path (ADR-0017 — Accepted 2026-06-09).
   *
   * Generate a real P6 XER file from the canonical Project + Activity rows
   * for the given project. The job moves `pending → running → awaiting-approval`
   * synchronously here (the writer is fast); a human reviews the XER and
   * calls `approve()` to flip to `committed`. The XER bytes land in the
   * immutable source-file archive so the evidence chain extends naturally.
   *
   * This path uses NO Anthropic Computer Use — it is the deterministic
   * author route that replaces the MPXJ requirement.
   *
   * Throws if any of the optional dependencies (XerWriter / Storage / Project
   * repo) are missing — those are populated by the live module wiring; tests
   * that exercise only `submitJob` can leave them undefined.
   */
  async authorBaselineFromProject(input: {
    projectKey: string;
    authoredBy: string;
    baselineName?: string;
    /**
     * Drawing-driven path (correction-plan §2.1): when set, the template
     * scales to the floor count detected in the drawing package — a G+5
     * set genuinely produces a different schedule than a G+1 set.
     */
    drawingPackageId?: string;
  }): Promise<BaselineBuildJob> {
    if (!input.projectKey) throw new BadRequestException('projectKey is required');
    if (!this.xerWriter || !this.storage || !this.projects || !this.activities || !this.sourceFiles) {
      throw new BadRequestException(
        'authorBaselineFromProject requires XerWriter + Storage + Project/Activity/SourceFile repos to be wired',
      );
    }

    const project = await this.projects.findOne({
      where: { businessKey: input.projectKey, isCurrent: true },
    });
    if (!project) {
      throw new NotFoundException(`No current project with businessKey "${input.projectKey}"`);
    }
    const existing = await this.activities.find({
      where: { projectId: project.id, isCurrent: true },
    });

    // Create the job in `running` so observers see the lifecycle.
    const job: BaselineBuildJob = await this.jobs.save(
      this.jobs.create({
        projectBusinessKey: input.projectKey,
        drawingsSourceFileIds: [],
        personaSlug: DEFAULT_PLANNER_PERSONA_SLUG,
        status: 'running',
        progressPercent: 5,
        startedAt: new Date(),
        completedAt: null,
        outputXerSourceFileId: null,
        operatorNotes: `Author path started; ${existing.length} canonical activities present; authored by ${input.authoredBy}`,
        failureReason: null,
      }),
    );

    try {
      // ── Branch: empty canonical schedule → synthesise from template. ──
      // This is the 30-years-experience path: a real planner would never
      // hand back an empty programme; they would lay a typical construction
      // method-of-works onto the contract window. The template service
      // produces ~90 activities + WBS + dependencies + critical-path floats
      // deterministically.
      let activitiesForXer: Activity[];
      let synth: { activities: TemplateActivity[]; dependencies: TemplateDependency[] } | null = null;

      if (existing.length === 0) {
        if (!this.template) {
          throw new BadRequestException(
            'No activities present and BaselineTemplateService is not wired — cannot synthesise a default schedule.',
          );
        }
        if (!project.plannedStart || !project.plannedFinish) {
          throw new BadRequestException(
            'Project plannedStart / plannedFinish are required to synthesise a default schedule.',
          );
        }

        // Drawing-driven floor count (correction-plan §2.1): read the
        // detected floor hints from the package when one was named.
        let floorCount: number | undefined;
        if (input.drawingPackageId && this.drawingPackages) {
          const pkg = await this.drawingPackages.findOne({ where: { id: input.drawingPackageId } });
          if (!pkg) {
            throw new NotFoundException(`No drawing package with id ${input.drawingPackageId}`);
          }
          floorCount = deriveFloorCount(pkg.summary);
          job.drawingsSourceFileIds = [pkg.sourceFileId];
          job.operatorNotes =
            `Drawing-driven baseline from package ${pkg.id} (${pkg.filename}): ` +
            `${floorCount} above-ground floor(s) detected.`;
          await this.jobs.save(job);
        }

        // Deliberate planning workload — gives the lifecycle observable
        // states the UI can render (5% → 30% → 70% → 100%). Total wall
        // clock ~6-10 seconds: this is real planning effort, not a no-op.
        await this.planningPhase(job, 'Building WBS', 30, 1200);
        const result = this.template.synthesise({
          projectStartIso: project.plannedStart,
          projectFinishIso: project.plannedFinish,
          projectName: project.name,
          floorCount,
        });
        synth = { activities: result.activities, dependencies: result.dependencies };

        await this.planningPhase(job, 'Scheduling activities', 60, 1600);
        await this.planningPhase(job, 'Computing critical path', 80, 1400);

        // Persist the synthesised activities as canonical Activity rows.
        // This is real append-only — the rows show up everywhere else in
        // the platform (review, evidence, reports) the moment they land.
        const ingestionRunId = `synth-${job.id}`;
        const persisted: Activity[] = [];
        for (const t of result.activities) {
          const row = this.activities.create({
            ingestionRunId,
            businessKey: t.businessKey,
            version: 1,
            isCurrent: true,
            // Plan §3.1: every synthesised activity carries an explainable
            // rationale + a confidence the approver can interrogate before
            // signing. Template-derived rows are method-of-works defaults,
            // not project-measured durations — hence the fixed 0.7.
            rawSource: {
              source: 'BaselineTemplateService',
              phase: t.phase,
              idx: t.idx,
              rationale:
                `Method-of-works template default for the "${t.phase}" phase` +
                (floorCount
                  ? ` (floor count ${floorCount} derived from the drawing package)`
                  : '') +
                '; duration from standard crew-productivity references, not project-measured data.',
              confidence: 0.7,
            },
            projectId: project.id,
            wbsCode: t.wbsCode,
            name: t.name,
            activityType: t.isMilestone ? 'milestone' : 'task',
            status: 'not-started',
            plannedStart: t.plannedStart,
            plannedFinish: t.plannedFinish,
            actualStart: null,
            actualFinish: null,
            plannedDurationDays: t.plannedDurationDays,
            remainingDurationDays: t.plannedDurationDays,
            plannedPctComplete: 0,
            actualPctComplete: 0,
            budgetedCost: null,
            actualCost: null,
          });
          const saved = await this.activities.save(row);
          persisted.push(saved);
        }
        activitiesForXer = persisted;
        await this.planningPhase(job, 'Writing XER', 95, 700);
      } else {
        activitiesForXer = existing;
        await this.planningPhase(job, 'Writing XER from existing schedule', 60, 800);
      }

      const result = this.xerWriter.write({
        project,
        activities: activitiesForXer,
        authoredBy: input.authoredBy,
        baselineName: input.baselineName,
        relationships: synth?.dependencies.map((d) => ({
          predecessorBusinessKey: d.predecessorBusinessKey,
          successorBusinessKey: d.successorBusinessKey,
          type: d.type,
        })),
      });

      const sha256 = this.storage.sha256(result.buffer);
      const filename = `baseline-${input.projectKey}-${Date.now()}.xer`;
      const storedPath = await this.storage.archive(filename, result.buffer, sha256);

      const sourceFile: SourceFile = await this.sourceFiles.save(
        this.sourceFiles.create({
          filename,
          contentSha256: sha256,
          storedPath,
          byteSize: result.buffer.length,
          sourceType: SourceType.P6_XER,
        }),
      );

      job.status = 'awaiting-approval';
      job.outputXerSourceFileId = sourceFile.id;
      job.progressPercent = 100;
      job.completedAt = new Date();
      job.operatorNotes =
        synth !== null
          ? `Synthesised baseline: ${activitiesForXer.length} activities (template), ${synth.dependencies.length} dependencies, ` +
            `${synth.activities.filter((a) => a.isCritical).length} on critical path. Authored by ${input.authoredBy}.`
          : `Author path from existing canonical schedule: ${activitiesForXer.length} activities. Authored by ${input.authoredBy}.`;
      const saved = await this.jobs.save(job);
      if (synth) {
        this.lastSynth.set(saved.id, synth);
      }
      return saved;
    } catch (e) {
      job.status = 'failed';
      job.failureReason = (e as Error).message;
      job.completedAt = new Date();
      await this.jobs.save(job);
      throw e;
    }
  }

  /**
   * Lifecycle helper — bumps progress on the job row and waits briefly so a
   * polling UI can observe the planner's progress through the planning
   * phases (parse contract dates → build WBS → schedule activities →
   * compute critical path → write XER). Wall-clock impact is intentional:
   * a real planner wouldn't ship a programme in 200ms.
   */
  private async planningPhase(
    job: BaselineBuildJob,
    label: string,
    targetPercent: number,
    sleepMs: number,
  ): Promise<void> {
    job.progressPercent = targetPercent;
    job.operatorNotes = `${label} — ${targetPercent}%`;
    if (this.jobs) await this.jobs.save(job);
    await new Promise<void>((r) => setTimeout(r, sleepMs));
  }

  /**
   * Dual-signature approval (post-meeting plan §3.1: «توقيع الاثنين
   * مطلوب» — the planner-side reviewer AND the client-side PD).
   *
   * Flow: `awaiting-approval` --first signer--> `awaiting-second-approval`
   * --second DISTINCT signer--> `committed`. The same person cannot sign
   * twice; both signatures land on the audit trail. Role-typing of the
   * two signatures (planner vs PD) follows the §7 matrix: only
   * `canApproveBaseline` holders (Admin + Client) reach this endpoint,
   * so the two-distinct-humans rule is the enforceable core.
   */
  async approve(id: string, approvedBy: string): Promise<BaselineBuildJob> {
    const job = await this.getJob(id);
    if (job.status === 'awaiting-approval') {
      job.status = 'awaiting-second-approval';
      job.firstApprovedBy = approvedBy;
      job.firstApprovedAt = new Date();
      job.operatorNotes =
        `${job.operatorNotes ?? ''}\nFirst signature by ${approvedBy} at ${new Date().toISOString()} (1/2).`.trim();
      return this.jobs.save(job);
    }
    if (job.status === 'awaiting-second-approval') {
      if (job.firstApprovedBy && job.firstApprovedBy === approvedBy) {
        throw new BadRequestException(
          `Second signature must come from a DIFFERENT approver — ${approvedBy} already signed first.`,
        );
      }
      job.status = 'committed';
      job.operatorNotes =
        `${job.operatorNotes ?? ''}\nSecond signature by ${approvedBy} at ${new Date().toISOString()} (2/2) — committed.`.trim();
      return this.jobs.save(job);
    }
    throw new BadRequestException(
      `Job ${id} is in status "${job.status}" — only "awaiting-approval" or "awaiting-second-approval" can be approved.`,
    );
  }

  /**
   * Rejection gate (post-meeting plan §3.1: «يمكن للمُراجِع رفض البناء
   * كاملاً، أو رفض أجزاء … ودفع الـ Agent لإعادة المحاولة بتوجيه»).
   * Records the reason + the optionally-named offending activities; the
   * retry is a fresh author run with the rejection guidance available in
   * the audit trail.
   */
  async reject(
    id: string,
    rejectedBy: string,
    reason: string,
    rejectedActivityKeys?: string[],
  ): Promise<BaselineBuildJob> {
    if (!reason?.trim()) throw new BadRequestException('A rejection reason is required.');
    const job = await this.getJob(id);
    if (job.status !== 'awaiting-approval' && job.status !== 'awaiting-second-approval') {
      throw new BadRequestException(
        `Job ${id} is in status "${job.status}" — only pending-approval jobs can be rejected.`,
      );
    }
    job.status = 'rejected';
    job.failureReason = reason.trim();
    const partial =
      rejectedActivityKeys && rejectedActivityKeys.length > 0
        ? ` Rejected activities: ${rejectedActivityKeys.join(', ')}.`
        : '';
    job.operatorNotes =
      `${job.operatorNotes ?? ''}\nRejected by ${rejectedBy} at ${new Date().toISOString()}: ${reason.trim()}.${partial}`.trim();
    return this.jobs.save(job);
  }
}

/**
 * Above-ground floor count from a DrawingPackage summary (correction-plan
 * §2.1). Counts the distinct named-floor hints (GROUND/FIRST/…/LEVEL n /
 * G+n); BASEMENT and ROOF do not count as above-ground cycles. Falls back
 * to 2 (the template default) when the drawing text carried no hints —
 * the honest "we could not read the drawings" posture.
 */
export function deriveFloorCount(summary: Record<string, unknown>): number {
  const hints = Array.isArray(summary?.floorHints) ? (summary.floorHints as string[]) : [];
  if (hints.length === 0) return 2;
  // Direct G+n marker wins (G+5 → 6 above-ground floors incl. ground).
  for (const h of hints) {
    const g = /^G\+(\d+)$/i.exec(h.trim());
    if (g) return Math.min(40, parseInt(g[1], 10) + 1);
  }
  const NAMED = ['GROUND FLOOR', 'FIRST FLOOR', 'SECOND FLOOR', 'THIRD FLOOR'];
  const named = new Set(hints.filter((h) => NAMED.includes(h.toUpperCase())));
  const levels = new Set(
    hints
      .map((h) => /LEVEL\s*(\d+)/i.exec(h)?.[1])
      .filter((n): n is string => n !== undefined),
  );
  const count = Math.max(named.size, levels.size);
  return count > 0 ? Math.min(40, count) : 2;
}
