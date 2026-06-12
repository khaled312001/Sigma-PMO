import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { LifecycleLedgerEntry, QsFinding } from '../canonical/entities';
import {
  LedgerDimension,
  STAGE_LABELS,
  isValidStage,
  stageIndex,
  stagesFor,
  toleranceFor,
} from './traceability-chains';

export interface RecordInput {
  projectKey: string;
  dimension: LedgerDimension;
  subjectKey: string;
  subjectLabel?: string;
  stage: string;
  value: number;
  unit?: string | null;
  currency?: string | null;
  originType: string;
  originRef?: string | null;
  changeReason?: string | null;
  approvedBy?: string | null;
  evidenceRefs?: Array<Record<string, unknown>>;
  recordedBy?: string | null;
}

/**
 * TraceabilityService — Quantity Governance + Cost Governance traceability
 * (Mr. Ayham, 2026-06-12 follow-up). Records every number at every lifecycle
 * stage append-only with full provenance, builds the chain with the variance
 * at each hop, and raises governance findings for material deviations. Answers,
 * for any number: where it originated, how/why it changed, who approved it,
 * and what evidence supports it.
 */
@Injectable()
export class TraceabilityService {
  private readonly logger = new Logger(TraceabilityService.name);

  constructor(
    @InjectRepository(LifecycleLedgerEntry) private readonly ledger: Repository<LifecycleLedgerEntry>,
    @InjectRepository(QsFinding) private readonly findings: Repository<QsFinding>,
  ) {}

  /** Append a stage value (supersedes the prior current row for that stage). */
  async record(input: RecordInput): Promise<LifecycleLedgerEntry> {
    if (!input.projectKey?.trim()) throw new BadRequestException('projectKey is required');
    if (!['quantity', 'cost', 'revenue', 'cashflow'].includes(input.dimension)) {
      throw new BadRequestException('dimension must be quantity | cost | revenue | cashflow');
    }
    if (!isValidStage(input.dimension, input.stage)) {
      throw new BadRequestException(`Invalid ${input.dimension} stage "${input.stage}". Valid: ${stagesFor(input.dimension).join(', ')}`);
    }
    if (!Number.isFinite(input.value)) throw new BadRequestException('value must be a number');
    if (!input.subjectKey?.trim()) throw new BadRequestException('subjectKey is required');

    const prior = await this.ledger.findOne({
      where: {
        projectBusinessKey: input.projectKey, dimension: input.dimension,
        subjectKey: input.subjectKey, stage: input.stage, isCurrent: true,
      },
    });
    if (prior) { prior.isCurrent = false; await this.ledger.save(prior); }

    return this.ledger.save(this.ledger.create({
      projectBusinessKey: input.projectKey,
      dimension: input.dimension,
      subjectKey: input.subjectKey,
      subjectLabel: input.subjectLabel?.trim() || input.subjectKey,
      stage: input.stage,
      value: String(input.value),
      unit: input.unit ?? null,
      currency: input.currency ?? null,
      originType: input.originType,
      originRef: input.originRef ?? null,
      changeReason: input.changeReason ?? null,
      approvedBy: input.approvedBy ?? null,
      evidenceRefs: input.evidenceRefs ?? null,
      supersedesId: prior?.id ?? null,
      isCurrent: true,
      recordedBy: input.recordedBy ?? null,
    }));
  }

  /** Distinct tracked subjects for a project (optionally one dimension). */
  async subjects(projectKey: string, dimension?: LedgerDimension): Promise<Array<{ dimension: string; subjectKey: string; subjectLabel: string; stagesRecorded: number }>> {
    const where: Record<string, unknown> = { projectBusinessKey: projectKey, isCurrent: true };
    if (dimension) where.dimension = dimension;
    const rows = await this.ledger.find({ where });
    const map = new Map<string, { dimension: string; subjectKey: string; subjectLabel: string; stagesRecorded: number }>();
    for (const r of rows) {
      const k = `${r.dimension}:${r.subjectKey}`;
      const e = map.get(k) ?? { dimension: r.dimension, subjectKey: r.subjectKey, subjectLabel: r.subjectLabel, stagesRecorded: 0 };
      e.stagesRecorded += 1;
      map.set(k, e);
    }
    return [...map.values()].sort((a, b) => a.subjectKey.localeCompare(b.subjectKey));
  }

  /**
   * Build the full traceability chain for one subject: each stage with its
   * current value, the variance vs the previous RECORDED stage, and the
   * provenance (origin / change reason / approver / evidence + history depth).
   */
  async chain(projectKey: string, dimension: LedgerDimension, subjectKey: string): Promise<{
    projectKey: string; dimension: LedgerDimension; subjectKey: string; subjectLabel: string;
    stages: Array<{
      stage: string; label: string; recorded: boolean;
      value: number | null; unit: string | null; currency: string | null;
      originType: string | null; originRef: string | null; changeReason: string | null;
      approvedBy: string | null; evidenceCount: number; historyDepth: number; recordedAt: string | null;
      variancePctFromPrev: number | null; varianceFromStage: string | null;
    }>;
  }> {
    const all = await this.ledger.find({
      where: { projectBusinessKey: projectKey, dimension, subjectKey },
      order: { createdAt: 'ASC' },
    });
    const current = new Map<string, LifecycleLedgerEntry>();
    const history = new Map<string, number>();
    for (const r of all) {
      history.set(r.stage, (history.get(r.stage) ?? 0) + 1);
      if (r.isCurrent) current.set(r.stage, r);
    }
    const label = all[0]?.subjectLabel ?? subjectKey;

    const stageList = stagesFor(dimension);
    let prevValue: number | null = null;
    let prevStage: string | null = null;
    const stages = stageList.map((stage) => {
      const row = current.get(stage) ?? null;
      const value = row ? Number(row.value) : null;
      let variancePctFromPrev: number | null = null;
      let varianceFromStage: string | null = null;
      if (value !== null && prevValue !== null && prevValue !== 0) {
        variancePctFromPrev = round4((value - prevValue) / prevValue);
        varianceFromStage = prevStage;
      }
      if (value !== null) { prevValue = value; prevStage = stage; }
      return {
        stage,
        label: STAGE_LABELS[stage] ?? stage,
        recorded: !!row,
        value,
        unit: row?.unit ?? null,
        currency: row?.currency ?? null,
        originType: row?.originType ?? null,
        originRef: row?.originRef ?? null,
        changeReason: row?.changeReason ?? null,
        approvedBy: row?.approvedBy ?? null,
        evidenceCount: Array.isArray(row?.evidenceRefs) ? row!.evidenceRefs!.length : 0,
        historyDepth: history.get(stage) ?? 0,
        recordedAt: row ? row.createdAt.toISOString() : null,
        variancePctFromPrev,
        varianceFromStage,
      };
    });
    return { projectKey, dimension, subjectKey, subjectLabel: label, stages };
  }

  /** All chain-variance findings for a project (the QS finding store). */
  listChainFindings(projectKey: string): Promise<QsFinding[]> {
    return this.findings.find({
      where: { projectBusinessKey: projectKey, findingType: 'chain-variance' },
      order: { createdAt: 'DESC' },
    });
  }

  /** The full append-only history of one subject+stage (the change trail). */
  async history(projectKey: string, dimension: LedgerDimension, subjectKey: string, stage: string): Promise<LifecycleLedgerEntry[]> {
    return this.ledger.find({
      where: { projectBusinessKey: projectKey, dimension, subjectKey, stage },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Validate every subject's chain and raise QS findings (findingType
   * 'chain-variance') for hops whose variance exceeds the stage tolerance.
   * Idempotent via dedupKey. Returns the findings raised.
   */
  async validate(projectKey: string, dimensions?: LedgerDimension[]): Promise<{ projectKey: string; findings: QsFinding[]; subjectsChecked: number }> {
    const allSubjects = await this.subjects(projectKey);
    const subjects = dimensions ? allSubjects.filter((s) => dimensions.includes(s.dimension as LedgerDimension)) : allSubjects;
    const drafts: Array<{ severity: 'warning' | 'critical'; title: string; description: string; refs: Record<string, unknown>; quantum: number | null; dedupKey: string }> = [];

    for (const s of subjects) {
      const chain = await this.chain(projectKey, s.dimension as LedgerDimension, s.subjectKey);
      for (const st of chain.stages) {
        if (st.variancePctFromPrev === null || st.varianceFromStage === null) continue;
        const tol = toleranceFor(st.stage);
        const abs = Math.abs(st.variancePctFromPrev);
        if (abs < tol.warn) continue;
        const severity: 'warning' | 'critical' = abs >= tol.crit ? 'critical' : 'warning';
        drafts.push({
          severity,
          title: `${s.dimension === 'cost' ? 'Cost' : 'Quantity'} chain variance: ${st.label} vs ${STAGE_LABELS[st.varianceFromStage] ?? st.varianceFromStage} (${(st.variancePctFromPrev * 100).toFixed(0)}%) — ${s.subjectLabel}`,
          description:
            `Subject "${s.subjectLabel}" (${s.dimension}): ${st.label} = ${st.value} vs ${STAGE_LABELS[st.varianceFromStage] ?? st.varianceFromStage} ` +
            `(${(st.variancePctFromPrev * 100).toFixed(1)}% ${st.variancePctFromPrev > 0 ? 'higher' : 'lower'}). ` +
            `Origin: ${st.originType ?? '—'}${st.approvedBy ? `, approved by ${st.approvedBy}` : ''}. Tolerance for this hop: ${(tol.warn * 100).toFixed(0)}% warn / ${(tol.crit * 100).toFixed(0)}% critical.`,
          refs: {
            dimension: s.dimension, subjectKey: s.subjectKey, fromStage: st.varianceFromStage, toStage: st.stage,
            variancePct: st.variancePctFromPrev, originType: st.originType, approvedBy: st.approvedBy, evidenceCount: st.evidenceCount,
          },
          quantum: null,
          dedupKey: `chain:${projectKey}:${s.dimension}:${s.subjectKey}:${st.varianceFromStage}->${st.stage}`,
        });
      }
    }

    const persisted = await this.persistFindings(projectKey, drafts);
    this.logger.log(`Traceability validation for ${projectKey}: ${persisted.length} chain finding(s) across ${subjects.length} subject(s).`);
    return { projectKey, findings: persisted, subjectsChecked: subjects.length };
  }

  private async persistFindings(projectKey: string, drafts: Array<{ severity: string; title: string; description: string; refs: Record<string, unknown>; quantum: number | null; dedupKey: string }>): Promise<QsFinding[]> {
    const existing = await this.findings.find({ where: { projectBusinessKey: projectKey, findingType: 'chain-variance' } });
    const byKey = new Map(existing.map((e) => [e.dedupKey, e]));
    const out: QsFinding[] = [];
    for (const d of drafts) {
      const prior = byKey.get(d.dedupKey);
      if (prior) {
        prior.severity = d.severity;
        prior.title = d.title;
        prior.description = d.description;
        prior.refs = d.refs;
        out.push(await this.findings.save(prior));
      } else {
        out.push(await this.findings.save(this.findings.create({
          projectBusinessKey: projectKey,
          findingType: 'chain-variance',
          severity: d.severity,
          title: d.title,
          description: d.description,
          refs: d.refs,
          quantum: d.quantum !== null ? String(d.quantum) : null,
          status: 'open',
          dedupKey: d.dedupKey,
        })));
      }
    }
    return out;
  }
}

const round4 = (n: number): number => Math.round(n * 10000) / 10000;
