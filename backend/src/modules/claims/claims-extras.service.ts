import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { currentCompanyId } from '../../common/tenant/tenant-context';
import { Alert, Claim, ClaimEvidenceLink, ContractClauseRule, Letter, Project } from '../canonical/entities';
import type { ClaimEvidenceSourceRef } from '../canonical/entities/claim-evidence-link.entity';
import { EvidenceFile } from '../evidence/evidence-file.entity';
import { EvidenceItem } from '../evidence/evidence-item.entity';
import { EvidenceRoom } from '../evidence/evidence-room.entity';
import { ContractRulesService } from '../contract-rules/contract-rules.service';
import type { EvaluateResult, ProceduralVerdict } from '../contract-rules/contract-rules.service';
import { ForensicDelayService } from './forensic-delay.service';
import type { ForensicDelayReport } from './forensic-delay.service';
import { EntitlementAssessment, EntitlementService } from './entitlement.service';

/** A document-anchored evidence leg in the forensic claim chain. */
export interface ForensicChainLeg {
  /** Chain leg, e.g. letter / daily_report / baseline / photo / boq_line / fidic_clause. */
  linkType: string;
  label: string;
  items: Array<{
    source: 'link' | 'evidence_item';
    targetTable: string | null;
    targetId: string | null;
    title: string | null;
    fileId: string | null;
    fileName: string | null;
    page: number | null;
    paragraph: number | null;
    sha256: string | null;
    note: string | null;
  }>;
}

export interface ForensicClaimChain {
  generatedAt: string;
  claimId: string;
  projectKey: string;
  claim: Claim;
  forensicDelay: ForensicDelayReport;
  entitlement: EntitlementAssessment;
  fidicClauseVerdict: {
    clauseRef: string | null;
    rule: ContractClauseRule | null;
    /** preserved / weak / time_barred / pending / indeterminate — computed
     *  inline from the claim's event/notice dates + the matched rule, when both
     *  a rule with daysToAct and an event date are available; else null. */
    verdict: ProceduralVerdict | null;
    /** The full deterministic evaluation (deadline, withinTime, basis) when computed. */
    evaluation: EvaluateResult | null;
    /** Required procedural period in days from the matched rule (when present). */
    requiredPeriodDays: number | null;
    note: string;
  };
  legs: ForensicChainLeg[];
}

/** Evidence-room file category → forensic chain leg. */
const CATEGORY_TO_LEG: Record<string, string> = {
  correspondence: 'letter',
  daily_report: 'daily_report',
  schedule: 'baseline',
  drawing: 'baseline',
  image: 'photo',
  video: 'video',
  boq: 'boq_line',
  payment_cert: 'payment_cert',
};

const LEG_LABELS: Record<string, string> = {
  letter: 'Letters',
  daily_report: 'Daily reports',
  baseline: 'Baseline / programme update',
  update: 'Programme update',
  photo: 'Photos',
  video: 'Videos',
  boq_line: 'BOQ lines',
  payment_cert: 'Payment certificates',
  fidic_clause: 'FIDIC clause',
  alert: 'Alerts',
  decision: 'Governance decisions',
  evidence_item: 'Evidence-room findings',
};

/** The forensic chain legs we emit, in order. */
const LEG_ORDER = [
  'letter', 'daily_report', 'baseline', 'update', 'photo', 'video',
  'boq_line', 'payment_cert', 'fidic_clause', 'alert', 'decision', 'evidence_item',
];

/** Input to POST /claims/:id/links — one cited-evidence link. */
export interface CreateClaimLinkInput {
  linkType: string;
  targetTable: string;
  targetId: string;
  sourceRef?: ClaimEvidenceSourceRef | null;
  note?: string | null;
  createdBy?: string | null;
}

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
  /** Forensic evidence chain: cited evidence grouped by chain leg, source-ref'd. */
  evidenceChain: ForensicChainLeg[];
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
    @InjectRepository(ClaimEvidenceLink) private readonly evidenceLinks: Repository<ClaimEvidenceLink>,
    @InjectRepository(ContractClauseRule) private readonly clauseRules: Repository<ContractClauseRule>,
    @InjectRepository(EvidenceRoom) private readonly evidenceRooms: Repository<EvidenceRoom>,
    @InjectRepository(EvidenceItem) private readonly evidenceItems: Repository<EvidenceItem>,
    @InjectRepository(EvidenceFile) private readonly evidenceFiles: Repository<EvidenceFile>,
    private readonly entitlement: EntitlementService,
    private readonly forensic: ForensicDelayService,
    private readonly contractRules: ContractRulesService,
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

    const evidenceChain = await this.buildEvidenceChain(claim);

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
      evidenceChain,
    };
  }

  /**
   * Forensic evidence chain for one claim (Mr. Ayham acceptance 2026-06-28):
   * claim → forensic delay → entitlement → FIDIC clause verdict → evidence legs,
   * each leg source-ref'd. A single claim cites a letter + daily report +
   * baseline/update + photo/video + BOQ line + FIDIC clause; this assembles them
   * grouped by chain leg with the file/page/paragraph + sha256 anchor.
   */
  async forensicChain(claimId: string): Promise<ForensicClaimChain> {
    const claim = await this.claims.findOne({ where: { id: claimId } });
    if (!claim) throw new NotFoundException(`No claim "${claimId}"`);
    const projectKey = claim.projectBusinessKey;

    const letterCtx = await this.letterContext(projectKey);
    const entitlement = this.assess(claim, letterCtx);
    const forensicDelay = await this.forensic.analyse(projectKey);
    const legs = await this.buildEvidenceChain(claim);

    // FIDIC clause verdict: the active clause rule matching the claim's clause.
    let rule: ContractClauseRule | null = null;
    if (claim.fidicClause) {
      const rules = await this.clauseRules.find({
        where: { projectBusinessKey: projectKey, isCurrent: true },
      });
      const needle = normalizeClause(claim.fidicClause);
      rule = rules.find((r) => r.clauseRef && normalizeClause(r.clauseRef) === needle) ?? null;
    }

    // Procedural verdict computed INLINE (Mr. Ayham acceptance 2026-06-28): when
    // a matched rule carries a daysToAct window and the claim has a delay-event
    // date (or the earliest linked letter as a proxy), evaluate the notice window
    // here instead of pointing the user at /contract-rules/evaluate.
    const eventDate = claim.delayEventDate ?? toIsoDate(letterCtx.earliestLetterDate);
    const actionDate = claim.noticeServedDate ?? toIsoDate(letterCtx.earliestLetterDate);
    let evaluation: EvaluateResult | null = null;
    if (rule && rule.daysToAct != null && eventDate) {
      try {
        evaluation = this.contractRules.evaluate({
          eventDate,
          actionDate: actionDate ?? null,
          daysToAct: rule.daysToAct,
        });
      } catch {
        evaluation = null; // malformed date — fall back to descriptive note.
      }
    }

    const fidicClauseVerdict = {
      clauseRef: claim.fidicClause,
      rule,
      verdict: evaluation ? evaluation.verdict : null,
      evaluation,
      requiredPeriodDays: rule?.daysToAct ?? null,
      note: evaluation && rule
        ? `Claim cites ${rule.clauseRef ?? claim.fidicClause} (${rule.ruleType.replace('_', ' ')}, ${rule.daysToAct}-day window, deadline ${evaluation.deadline}): ${evaluation.verdict.replace('_', '-')}. ${evaluation.basis}`
        : rule
          ? `Claim cites ${rule.clauseRef ?? claim.fidicClause} (${rule.ruleType.replace('_', ' ')}): ${rule.consequence ?? rule.title}.` +
            (rule.daysToAct != null
              ? ` Procedural window ${rule.daysToAct} day(s) — record a delayEventDate on the claim (or link a notice letter) for an inline preserved/weak/time-barred verdict.`
              : '')
          : claim.fidicClause
            ? `Claim cites ${claim.fidicClause} but no matching active clause rule is on the project register. Seed a FIDIC preset or add the rule for a procedural verdict.`
            : 'No FIDIC clause is recorded on this claim.',
    };

    return {
      generatedAt: new Date().toISOString(),
      claimId,
      projectKey,
      claim,
      forensicDelay,
      entitlement,
      fidicClauseVerdict,
      legs,
    };
  }

  /**
   * Write a single cited-evidence link onto a claim (Mr. Ayham acceptance
   * 2026-06-28 — closing the cited-evidence leg). The link is the explicit,
   * document-anchored citation `buildEvidenceChain` reads first, so a leg
   * populates from a real ClaimEvidenceLink row rather than only the
   * EvidenceRoom category mapping. Idempotent: an identical (linkType,
   * targetTable, targetId) link is returned instead of duplicated.
   */
  async createLink(claimId: string, input: CreateClaimLinkInput): Promise<ClaimEvidenceLink> {
    const claim = await this.claims.findOne({ where: { id: claimId } });
    if (!claim) throw new NotFoundException(`No claim "${claimId}"`);
    if (!input?.linkType?.trim()) throw new BadRequestException('linkType is required');
    if (!input?.targetTable?.trim()) throw new BadRequestException('targetTable is required');
    if (!input?.targetId?.toString().trim()) throw new BadRequestException('targetId is required');

    const targetId = String(input.targetId);
    const existing = await this.evidenceLinks.findOne({
      where: { claimId, linkType: input.linkType, targetTable: input.targetTable, targetId },
    });
    if (existing) return existing;

    const link = this.evidenceLinks.create({
      companyId: currentCompanyId(),
      claimId,
      linkType: input.linkType,
      targetTable: input.targetTable,
      targetId,
      sourceRef: input.sourceRef ?? null,
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
    });
    return this.evidenceLinks.save(link);
  }

  /**
   * Assemble the document-anchored evidence legs for a claim: the explicit
   * ClaimEvidenceLink rows, plus EvidenceRoom EvidenceItems (mapped from their
   * source file's category to a chain leg) for the claim's project. Grouped by
   * leg in lifecycle order; each item carries file / page / paragraph + sha256.
   */
  private async buildEvidenceChain(claim: Claim): Promise<ForensicChainLeg[]> {
    const byLeg = new Map<string, ForensicChainLeg['items']>();
    const push = (leg: string, item: ForensicChainLeg['items'][number]): void => {
      const arr = byLeg.get(leg) ?? [];
      arr.push(item);
      byLeg.set(leg, arr);
    };

    // 1. Explicit links for this claim.
    const links = await this.evidenceLinks.find({ where: { claimId: claim.id } });
    for (const l of links) {
      push(l.linkType, {
        source: 'link',
        targetTable: l.targetTable,
        targetId: l.targetId,
        title: l.note ?? null,
        fileId: l.sourceRef?.fileId ?? null,
        fileName: null,
        page: l.sourceRef?.page ?? null,
        paragraph: l.sourceRef?.paragraph ?? null,
        sha256: l.sourceRef?.sha256 ?? null,
        note: l.note ?? null,
      });
    }

    // 2. EvidenceRoom items for the claim's project, grouped by their file
    //    category → chain leg (categories letter/daily_report/drawing/image/
    //    video/boq/payment_cert).
    const rooms = await this.evidenceRooms.find({ where: { projectBusinessKey: claim.projectBusinessKey } });
    const roomIds = rooms.map((r) => r.id);
    if (roomIds.length) {
      const files = await this.evidenceFiles.find({ where: { roomId: In(roomIds) } });
      const fileById = new Map(files.map((f) => [f.id, f]));
      const items = await this.evidenceItems.find({ where: { roomId: In(roomIds) } });
      for (const it of items) {
        const refs = it.sourceRefs ?? [];
        const primary = refs[0] ?? null;
        const file = primary?.fileId ? fileById.get(primary.fileId) ?? null : null;
        const category = file?.category ?? null;
        const leg = (category && CATEGORY_TO_LEG[category]) || 'evidence_item';
        push(leg, {
          source: 'evidence_item',
          targetTable: 'evidence_item',
          targetId: it.id,
          title: it.label,
          fileId: primary?.fileId ?? null,
          fileName: primary?.fileName ?? file?.fileName ?? null,
          page: primary?.page ?? null,
          paragraph: primary?.paragraph ?? null,
          sha256: file?.sha256 ?? null,
          note: it.value ?? null,
        });
      }
    }

    return LEG_ORDER
      .filter((leg) => byLeg.has(leg))
      .map((leg) => ({ linkType: leg, label: LEG_LABELS[leg] ?? leg, items: byLeg.get(leg)! }));
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
      // Notice reference: the claim's served-notice date when recorded, else the
      // earliest linked letter date — so the notice-within-deadline criterion is
      // evaluated rather than null-skipped (Mr. Ayham acceptance 2026-06-28).
      noticeLetterDate: claim.noticeServedDate ?? letterCtx.earliestLetterDate,
      noticeDeadlineDays: letterCtx.deadlineDays,
      // The real delay-event date now flows in (previously hardcoded null).
      delayEventDate: claim.delayEventDate ?? null,
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

/** Reduce a clause reference to its digit/dot core so "Sub-Clause 20.1 [1999]" matches "20.1". */
function normalizeClause(ref: string): string {
  const m = ref.match(/\d+(?:\.\d+)*/);
  return (m ? m[0] : ref).trim();
}

/** A Date (or ISO string) → YYYY-MM-DD, or null. */
function toIsoDate(d: Date | string | null): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
