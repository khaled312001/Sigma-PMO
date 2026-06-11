import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Alert, Claim, Letter, Project } from '../canonical/entities';
import { EntitlementAssessment, EntitlementService } from './entitlement.service';

export interface ClaimEntitlementRow {
  claim: Claim;
  entitlement: EntitlementAssessment;
}
export interface EntitlementListResult {
  projectKey: string;
  count: number;
  rows: ClaimEntitlementRow[];
}

export interface ReadinessBreakdown {
  evidenceLinked: { present: boolean; points: number; max: number };
  entitlement: { likelihood: string; points: number; max: number };
  quantumDocumented: { present: boolean; points: number; max: number };
  narrativePresent: { present: boolean; points: number; max: number };
}
export interface ReadinessResult {
  claimId: string;
  projectKey: string;
  readinessScore: number;
  label: 'ready' | 'developing' | 'weak';
  breakdown: ReadinessBreakdown;
  entitlement: EntitlementAssessment;
  basis: string;
}

export interface ClaimPackage {
  generatedAt: string;
  projectKey: string;
  claim: Claim;
  delayAnalysis: {
    estimatedDays: number | null;
    estimatedAmount: string | null;
    type: string;
    fidicClause: string | null;
    responsibleParty: string;
  };
  entitlement: EntitlementAssessment;
  readiness: ReadinessResult;
  relatedAlerts: Array<{
    id: string; code: string; severity: string; summary: string; context: Record<string, unknown>;
  }>;
  sourceRefs: {
    evidenceRefs: string[];
    linkedLetterIds: string[];
    relatedAlertIds: string[];
  };
}

/**
 * ClaimsExtrasService — L6 extensions beyond the base claims agent:
 *  - entitlement screening for every claim on a project,
 *  - a readiness score (0–100) per claim with a named breakdown,
 *  - an evidence-linked claim package (claim + delay + entitlement + readiness
 *    + related alerts + source refs) for dispute preparation.
 *
 * Deterministic: the entitlement ladder and readiness weights are explicit
 * formulas; no LLM is involved.
 */
@Injectable()
export class ClaimsExtrasService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Claim) private readonly claims: Repository<Claim>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(Letter) private readonly letters: Repository<Letter>,
    private readonly entitlement: EntitlementService,
  ) {}

  /** Entitlement screening for every claim on a project. */
  async entitlementList(projectKey: string): Promise<EntitlementListResult> {
    const claims = await this.claims.find({
      where: { projectBusinessKey: projectKey },
      order: { createdAt: 'DESC' },
    });
    const letterCtx = await this.letterContext(projectKey);
    const rows = claims.map((claim) => ({
      claim,
      entitlement: this.assess(claim, letterCtx),
    }));
    return { projectKey, count: rows.length, rows };
  }

  /** Readiness score (0–100) for one claim with a named breakdown. */
  async readiness(claimId: string): Promise<ReadinessResult> {
    const claim = await this.claims.findOne({ where: { id: claimId } });
    if (!claim) throw new NotFoundException(`No claim "${claimId}"`);
    const letterCtx = await this.letterContext(claim.projectBusinessKey);
    const entitlement = this.assess(claim, letterCtx);
    return this.computeReadiness(claim, entitlement);
  }

  /** Evidence-linked claim package JSON for dispute preparation. */
  async claimPackage(claimId: string): Promise<ClaimPackage> {
    const claim = await this.claims.findOne({ where: { id: claimId } });
    if (!claim) throw new NotFoundException(`No claim "${claimId}"`);
    const projectKey = claim.projectBusinessKey;

    const letterCtx = await this.letterContext(projectKey);
    const entitlement = this.assess(claim, letterCtx);
    const readiness = this.computeReadiness(claim, entitlement);

    // Related alerts: every alert for the project's current version chain that
    // falls in the same window (createdAt ≤ claim.createdAt + 1 day buffer),
    // plus any alert directly referenced as evidence.
    const project = await this.projects.findOne({
      where: { businessKey: projectKey, isCurrent: true },
    });
    const evidenceSet = new Set(claim.evidenceRefs ?? []);
    let projectAlerts: Alert[] = [];
    if (project) {
      const all = await this.alerts.find({ where: { projectId: project.id } });
      projectAlerts = all.filter(
        (a) => evidenceSet.has(a.id) || a.createdAt.getTime() <= claim.createdAt.getTime() + DAY_MS,
      );
    }

    return {
      generatedAt: new Date().toISOString(),
      projectKey,
      claim,
      delayAnalysis: {
        estimatedDays: claim.estimatedDays,
        estimatedAmount: claim.estimatedAmount,
        type: claim.type,
        fidicClause: claim.fidicClause,
        responsibleParty: claim.responsibleParty,
      },
      entitlement,
      readiness,
      relatedAlerts: projectAlerts.map((a) => ({
        id: a.id, code: a.code, severity: a.severity, summary: a.summary, context: a.context,
      })),
      sourceRefs: {
        evidenceRefs: claim.evidenceRefs ?? [],
        linkedLetterIds: letterCtx.letterIds,
        relatedAlertIds: projectAlerts.map((a) => a.id),
      },
    };
  }

  // ──────────────────────── helpers ────────────────────────

  private assess(claim: Claim, letterCtx: LetterContext): EntitlementAssessment {
    return this.entitlement.assess({
      responsibleParty: claim.responsibleParty,
      evidenceRefs: claim.evidenceRefs,
      estimatedDays: claim.estimatedDays,
      estimatedAmount: claim.estimatedAmount,
      basis: claim.basis,
      claimDate: claim.createdAt,
      noticeLetterDate: letterCtx.earliestLetterDate,
      noticeDeadlineDays: letterCtx.deadlineDays,
      delayEventDate: null, // not separately recorded on the claim row
    });
  }

  private computeReadiness(claim: Claim, entitlement: EntitlementAssessment): ReadinessResult {
    const evidenceLinked = (claim.evidenceRefs ?? []).length > 0;
    const quantumDocumented =
      (claim.estimatedAmount !== null && Number.parseFloat(claim.estimatedAmount) > 0) ||
      (claim.estimatedDays !== null && claim.estimatedDays > 0);
    const narrativePresent = !!claim.basis && claim.basis.trim().length >= 20;

    const evidencePts = evidenceLinked ? 30 : 0;
    const entitlementPts =
      entitlement.entitlementLikelihood === 'high' ? 25
        : entitlement.entitlementLikelihood === 'medium' ? 15
          : 0;
    const quantumPts = quantumDocumented ? 25 : 0;
    const narrativePts = narrativePresent ? 20 : 0;

    const readinessScore = evidencePts + entitlementPts + quantumPts + narrativePts;
    const label: ReadinessResult['label'] =
      readinessScore >= 75 ? 'ready' : readinessScore >= 45 ? 'developing' : 'weak';

    return {
      claimId: claim.id,
      projectKey: claim.projectBusinessKey,
      readinessScore,
      label,
      breakdown: {
        evidenceLinked: { present: evidenceLinked, points: evidencePts, max: 30 },
        entitlement: { likelihood: entitlement.entitlementLikelihood, points: entitlementPts, max: 25 },
        quantumDocumented: { present: quantumDocumented, points: quantumPts, max: 25 },
        narrativePresent: { present: narrativePresent, points: narrativePts, max: 20 },
      },
      entitlement,
      basis:
        'readinessScore = 30·evidenceLinked + 25·entitlementHigh(15 medium) + 25·quantumDocumented + 20·narrativePresent. ' +
        'Label: ≥75 ready, ≥45 developing, else weak.',
    };
  }

  /** Earliest linked letter date + deadline for the project's notice test. */
  private async letterContext(projectKey: string): Promise<LetterContext> {
    const rows = await this.letters.find({
      where: { projectBusinessKey: projectKey },
      order: { createdAt: 'ASC' },
    });
    if (rows.length === 0) {
      return { earliestLetterDate: null, deadlineDays: null, letterIds: [] };
    }
    const withDeadline = rows.find((l) => l.deadlineDays !== null);
    return {
      earliestLetterDate: rows[0].createdAt,
      deadlineDays: withDeadline ? withDeadline.deadlineDays : null,
      letterIds: rows.map((l) => l.id),
    };
  }
}

interface LetterContext {
  earliestLetterDate: Date | null;
  deadlineDays: number | null;
  letterIds: string[];
}
const DAY_MS = 24 * 60 * 60 * 1000;
