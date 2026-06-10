import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Layer } from '../../common/enums';
import { Activity, ClashItem, Letter, Project, Scenario } from '../canonical/entities';
import { LetterDrafterService } from '../letters/letter-drafter.service';
import { OutboxService } from '../outbox/outbox.service';

/** Outbox event type fired once a schedule revision lands (ADR-0012 namespace). */
export const SCHEDULE_REVISED_EVENT_TYPE = 'planning.schedule.revised';

/** What `applyClashResolution` returns to the controller / UI. */
export interface ApplyClashResolutionOutcome {
  clashId: string;
  chosenOptionIndex: number;
  /** businessKeys of the activities that received a new version. */
  revisedActivityKeys: string[];
  /** Highest activity version after the revision (the "تعديل رقم N" reference). */
  revisionNumber: number;
  scenarioId: string | null;
  outboxEventId: string;
  /** Draft claim letter id, or null when Claude is offline / drafting failed. */
  claimLetterId: string | null;
  /** Non-fatal warnings (e.g. "letter drafting skipped — AI offline"). */
  warnings: string[];
}

/**
 * ScheduleRevisionService — the atomic "approve & apply" arm of the clash
 * workflow (Wave 6, correction-plan §2.4).
 *
 * Implements the meeting requirement verbatim (2026-06-08 @ 00:10:24):
 * approval is NOT a status flip. In one transaction it:
 *
 *  1. Records the decision on the ClashItem (`chosenOptionIndex`,
 *     `decidedBy`, `decidedAt`).
 *  2. Issues a **new version** of every affected Activity — append-only:
 *     the current row flips `isCurrent=false`, a clone with the shifted
 *     `plannedFinish` (and bumped `version`) becomes current. Nothing is
 *     ever overwritten; the revision is fully reversible by re-flipping.
 *  3. Marks the referenced what-if Scenario `committed` so the audit trail
 *     links "what the human saw" to "what the platform did".
 *  4. Pushes one `planning.schedule.revised` event onto the cross-layer
 *     Outbox (same transaction — ADR-0012 producer contract).
 *
 * AFTER the transaction commits, it drafts the FIDIC claim letter via the
 * LetterDrafter (best-effort): a Claude outage must not roll back an
 * approved schedule revision, so letter drafting failures degrade to a
 * warning in the outcome instead of throwing.
 */
@Injectable()
export class ScheduleRevisionService {
  private readonly logger = new Logger(ScheduleRevisionService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ClashItem) private readonly clashes: Repository<ClashItem>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
    @InjectRepository(Scenario) private readonly scenarios: Repository<Scenario>,
    private readonly outbox: OutboxService,
    @Optional() private readonly letterDrafter?: LetterDrafterService,
  ) {}

  /**
   * Apply the chosen clash-resolution option to the canonical schedule.
   *
   * @param input.affectedActivityKeys Same optional override the simulation
   *        accepts. When omitted the latest-finishing activities are revised
   *        (the conservative-critical assumption the simulation displayed).
   */
  async applyClashResolution(input: {
    clashId: string;
    optionIndex: number;
    approvedBy: string;
    scenarioId?: string | null;
    affectedActivityKeys?: string[];
  }): Promise<ApplyClashResolutionOutcome> {
    if (!input.clashId) throw new BadRequestException('clashId is required');
    if (!input.approvedBy) throw new BadRequestException('approvedBy is required');

    const clash = await this.clashes.findOne({ where: { id: input.clashId } });
    if (!clash) throw new NotFoundException(`No clash item with id ${input.clashId}`);
    const options = clash.proposedOptions ?? [];
    const option = options[input.optionIndex];
    if (!option) {
      throw new BadRequestException(
        `Clash ${input.clashId} has no proposed option at index ${input.optionIndex} ` +
          `(${options.length} option(s) on file — run /propose first).`,
      );
    }
    if (clash.chosenOptionIndex !== null) {
      throw new BadRequestException(
        `Clash ${input.clashId} was already decided (option ${clash.chosenOptionIndex + 1} ` +
          `by ${clash.decidedBy ?? 'unknown'}). Revisions of a decision need a new clash row.`,
      );
    }

    const project = await this.projects.findOne({
      where: { businessKey: clash.projectBusinessKey, isCurrent: true },
    });
    if (!project) {
      throw new NotFoundException(
        `No current project with businessKey "${clash.projectBusinessKey}"`,
      );
    }

    const warnings: string[] = [];
    const d = Math.round(option.timeImpactDays);

    const outcome = await this.dataSource.transaction(async (manager) => {
      const activityRepo = manager.getRepository(Activity);
      const clashRepo = manager.getRepository(ClashItem);
      const scenarioRepo = manager.getRepository(Scenario);

      // 1. Decision lands on the clash row.
      const freshClash = await clashRepo.findOne({ where: { id: clash.id } });
      if (!freshClash) throw new NotFoundException(`Clash ${clash.id} disappeared mid-apply`);
      freshClash.chosenOptionIndex = input.optionIndex;
      freshClash.decidedBy = input.approvedBy;
      freshClash.decidedAt = new Date();
      await clashRepo.save(freshClash);

      // 2. Issue new Activity versions for the affected set.
      const current = await activityRepo.find({
        where: { projectId: project.id, isCurrent: true },
      });
      const dated = current.filter((a) => a.plannedFinish);
      const latestFinish = dated.length
        ? dated.map((a) => a.plannedFinish!).reduce((m, x) => (x > m ? x : m))
        : null;
      let affected: Activity[];
      if (input.affectedActivityKeys && input.affectedActivityKeys.length > 0) {
        affected = dated.filter((a) => input.affectedActivityKeys!.includes(a.businessKey));
        if (affected.length === 0) {
          throw new BadRequestException(
            'None of the provided affectedActivityKeys exist in the current schedule.',
          );
        }
      } else if (latestFinish !== null && d !== 0) {
        affected = dated.filter((a) => a.plannedFinish === latestFinish);
        warnings.push(
          'No affected activities named — the revision shifted the latest-finishing ' +
            '(critical) activities, mirroring what the simulation displayed.',
        );
      } else {
        affected = [];
      }

      const revisedKeys: string[] = [];
      let revisionNumber = 0;
      for (const row of affected) {
        // Append-only: retire the current row, clone with version+1.
        row.isCurrent = false;
        await activityRepo.save(row);
        const clone = activityRepo.create({
          ...row,
          id: undefined as unknown as string, // let the DB mint a fresh PK
          version: row.version + 1,
          isCurrent: true,
          plannedFinish: row.plannedFinish ? addDaysIso(row.plannedFinish, d) : row.plannedFinish,
          plannedDurationDays:
            row.plannedDurationDays !== null ? row.plannedDurationDays + d : row.plannedDurationDays,
          remainingDurationDays:
            row.remainingDurationDays !== null
              ? row.remainingDurationDays + d
              : row.remainingDurationDays,
          rawSource: {
            ...(typeof row.rawSource === 'object' && row.rawSource !== null ? row.rawSource : {}),
            revisedBy: 'ScheduleRevisionService',
            clashId: clash.id,
            optionIndex: input.optionIndex,
            approvedBy: input.approvedBy,
          },
        });
        const saved = await activityRepo.save(clone);
        revisedKeys.push(saved.businessKey);
        revisionNumber = Math.max(revisionNumber, saved.version);
      }

      // 3. Commit the what-if scenario when one was referenced.
      let scenarioId: string | null = null;
      if (input.scenarioId) {
        const scenario = await scenarioRepo.findOne({ where: { id: input.scenarioId } });
        if (scenario) {
          scenario.status = 'committed';
          await scenarioRepo.save(scenario);
          scenarioId = scenario.id;
        } else {
          warnings.push(`Scenario ${input.scenarioId} not found — approval recorded without it.`);
        }
      }

      // 4. Cross-layer event, same transaction.
      const event = await this.outbox.push(
        Layer.PLANNING,
        SCHEDULE_REVISED_EVENT_TYPE,
        {
          projectBusinessKey: clash.projectBusinessKey,
          clashId: clash.id,
          clashRef: clash.clashRef,
          optionIndex: input.optionIndex,
          optionLabel: option.label,
          durationImpactDays: d,
          costImpactAED: option.costImpactAED,
          revisedActivityKeys: revisedKeys,
          revisionNumber,
          approvedBy: input.approvedBy,
        },
        manager,
        { correlationId: clash.id },
      );

      return { revisedKeys, revisionNumber, scenarioId, outboxEventId: event.id };
    });

    // 5. Best-effort claim letter AFTER the commit — a Claude outage must not
    //    roll back an approved revision.
    let claimLetterId: string | null = null;
    if (this.letterDrafter) {
      try {
        const letter: Letter = await this.letterDrafter.draftComplianceLetter(
          clash.projectBusinessKey,
          'engineering.clash.resolution-claim',
          {
            triggerCode: 'engineering.clash.resolution-claim',
            narrative:
              `Clash ${clash.clashRef} was resolved by approving option ` +
              `${input.optionIndex + 1} ("${option.label}") on the Sigma PMO platform. ` +
              `Schedule impact: ${d >= 0 ? '+' : ''}${d} day(s); ` +
              `cost impact: ${option.costImpactAED === null ? 'to be priced via variation order' : `AED ${option.costImpactAED}`}. ` +
              `Draft the contractual notification to the contractor recording the agreed ` +
              `change, the schedule revision reference (rev ${outcome.revisionNumber}), and the ` +
              `applicable FIDIC sub-clause for the time/cost adjustment.`,
            facts: {
              clashId: clash.id,
              clashRef: clash.clashRef,
              optionIndex: input.optionIndex,
              durationImpactDays: d,
              costImpactAED: option.costImpactAED,
              revisedActivityKeys: outcome.revisedKeys,
              approvedBy: input.approvedBy,
              decidedAt: new Date().toISOString(),
            },
          },
        );
        claimLetterId = letter.id;
      } catch (err) {
        warnings.push(
          `Claim letter drafting failed (${(err as Error).message}) — draft it manually from /letters.`,
        );
      }
    } else {
      warnings.push('LetterDrafter not wired — claim letter must be drafted manually.');
    }

    this.logger.log(
      `Applied clash ${clash.clashRef} option ${input.optionIndex + 1}: ` +
        `${outcome.revisedKeys.length} activity revision(s) at rev ${outcome.revisionNumber}, ` +
        `letter=${claimLetterId ?? 'none'}, approvedBy=${input.approvedBy}`,
    );

    return {
      clashId: clash.id,
      chosenOptionIndex: input.optionIndex,
      revisedActivityKeys: outcome.revisedKeys,
      revisionNumber: outcome.revisionNumber,
      scenarioId: outcome.scenarioId,
      outboxEventId: outcome.outboxEventId,
      claimLetterId,
      warnings,
    };
  }
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
