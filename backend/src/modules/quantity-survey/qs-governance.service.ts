import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  BoQ,
  BoqItem,
  CostEstimate,
  ProjectRecord,
  QsFinding,
} from '../canonical/entities';
import { classifyElement } from './cost-classification';
import { BimCounts, deriveQuantitiesFromBim } from './bim-quantities';

interface DraftFinding {
  findingType: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  refs: Record<string, unknown>;
  quantum: number | null;
  dedupKey: string;
}

/**
 * QsGovernanceService — the Quantity Survey Governance Layer (Mr. Ayham,
 * 2026-06-12). Continuously compares the project's cost/quantity sources and
 * raises deterministic findings:
 *   • quantity-variance       BOQ element qty vs BIM-derived qty
 *   • cost-variance           latest cost-plan estimate vs BOQ total
 *   • over-measurement        a BOQ line qty exceeding its BIM-derived element
 *   • duplicate-quantity      two BOQ lines, same element + near-equal qty
 *   • quantity-cost-mismatch  a BOQ line where qty×rate ≠ stated amount
 *
 * Idempotent: findings are keyed by a stable dedupKey so re-running refreshes
 * (open ones are replaced) rather than duplicating. Pure deterministic maths.
 */
@Injectable()
export class QsGovernanceService {
  private readonly logger = new Logger(QsGovernanceService.name);

  // Element-level quantity variance beyond this fraction → finding.
  private readonly QTY_VARIANCE_WARN = 0.15;
  private readonly QTY_VARIANCE_CRIT = 0.35;
  private readonly COST_VARIANCE_WARN = 0.1;

  constructor(
    @InjectRepository(QsFinding) private readonly findings: Repository<QsFinding>,
    @InjectRepository(BoQ) private readonly boqs: Repository<BoQ>,
    @InjectRepository(BoqItem) private readonly items: Repository<BoqItem>,
    @InjectRepository(CostEstimate) private readonly estimates: Repository<CostEstimate>,
    @InjectRepository(ProjectRecord) private readonly records: Repository<ProjectRecord>,
  ) {}

  /** Run the full cross-source validation for a project; persist deduped findings. */
  async validate(projectKey: string): Promise<{ projectKey: string; findings: QsFinding[]; counts: Record<string, number> }> {
    const drafts: DraftFinding[] = [];

    // ── Load sources ──
    const boq = await this.boqs.findOne({
      where: { businessKey: `boq:${projectKey}`, isCurrent: true },
      order: { createdAt: 'DESC' },
    }) ?? await this.latestBoqByPrefix(projectKey);
    const boqLines = boq ? await this.items.find({ where: { boqId: boq.id } }) : [];

    const bim = await this.records.findOne({
      where: { projectBusinessKey: projectKey, recordType: 'bim-model', isCurrent: true },
      order: { createdAt: 'DESC' },
    });
    const bimQty = bim ? deriveQuantitiesFromBim((bim.details?.counts ?? {}) as BimCounts) : [];
    const bimByElement = new Map<string, number>();
    for (const q of bimQty) bimByElement.set(q.element, (bimByElement.get(q.element) ?? 0) + q.quantity);

    // ── 1. quantity-cost-mismatch + classify BOQ lines by element ──
    const boqByElement = new Map<string, number>();
    for (const l of boqLines) {
      const qty = Number(l.quantity);
      const rate = Number(l.unitRate);
      const amount = Number(l.amount);
      const expected = round2(qty * rate);
      if (Math.abs(expected - amount) > Math.max(1, amount * 0.005)) {
        drafts.push({
          findingType: 'quantity-cost-mismatch',
          severity: 'warning',
          title: `Quantity-to-cost mismatch on BOQ item ${l.itemNumber}`,
          description: `Item ${l.itemNumber} "${trim(l.description)}": quantity ${qty} × rate ${rate} = ${expected}, but the stated amount is ${amount}.`,
          refs: { boqItem: l.itemNumber, quantity: qty, rate, statedAmount: amount, expectedAmount: expected },
          quantum: round2(Math.abs(expected - amount)),
          dedupKey: `qcm:${projectKey}:${l.itemNumber}`,
        });
      }
      const el = classifyElement(l.description).element;
      if (el !== 'other') boqByElement.set(el, (boqByElement.get(el) ?? 0) + qty);
    }

    // ── 2. duplicate-quantity (same element, near-equal qty, distinct items) ──
    const byElementLines = new Map<string, Array<{ item: string; qty: number; desc: string }>>();
    for (const l of boqLines) {
      const el = classifyElement(l.description).element;
      if (el === 'other') continue;
      const arr = byElementLines.get(el) ?? [];
      arr.push({ item: l.itemNumber, qty: Number(l.quantity), desc: l.description });
      byElementLines.set(el, arr);
    }
    for (const [el, arr] of byElementLines) {
      for (let i = 0; i < arr.length; i += 1) {
        for (let j = i + 1; j < arr.length; j += 1) {
          const a = arr[i], b = arr[j];
          if (a.qty > 0 && b.qty > 0 && Math.abs(a.qty - b.qty) <= a.qty * 0.02) {
            drafts.push({
              findingType: 'duplicate-quantity',
              severity: 'warning',
              title: `Possible duplicate quantity in element "${el}"`,
              description: `Items ${a.item} and ${b.item} both measure ~${a.qty} of element "${el}" — possible double-counting.`,
              refs: { element: el, items: [a.item, b.item], quantity: a.qty },
              quantum: null,
              dedupKey: `dup:${projectKey}:${el}:${[a.item, b.item].sort().join('-')}`,
            });
          }
        }
      }
    }

    // ── 3. quantity-variance + over-measurement (BOQ vs BIM by element) ──
    for (const [el, boqQ] of boqByElement) {
      const bimQ = bimByElement.get(el);
      if (!bimQ || bimQ <= 0) continue;
      const variance = (boqQ - bimQ) / bimQ;
      const absVar = Math.abs(variance);
      if (absVar >= this.QTY_VARIANCE_WARN) {
        drafts.push({
          findingType: 'quantity-variance',
          severity: absVar >= this.QTY_VARIANCE_CRIT ? 'critical' : 'warning',
          title: `Quantity variance on "${el}": BOQ vs BIM ${(variance * 100).toFixed(0)}%`,
          description: `Element "${el}": BOQ quantity ${round2(boqQ)} vs BIM-derived ${round2(bimQ)} (${(variance * 100).toFixed(1)}% ${variance > 0 ? 'over' : 'under'}).`,
          refs: { element: el, boqQuantity: round2(boqQ), bimQuantity: round2(bimQ), variancePct: round4(variance) },
          quantum: null,
          dedupKey: `qv:${projectKey}:${el}`,
        });
      }
      // Over-measurement: BOQ materially exceeds the modelled quantity.
      if (variance > this.QTY_VARIANCE_CRIT) {
        drafts.push({
          findingType: 'over-measurement',
          severity: 'critical',
          title: `Over-measurement risk on "${el}"`,
          description: `BOQ measures ${round2(boqQ)} of "${el}" against a modelled ${round2(bimQ)} (+${(variance * 100).toFixed(0)}%). Verify the take-off before valuation.`,
          refs: { element: el, boqQuantity: round2(boqQ), bimQuantity: round2(bimQ), overBy: round2(boqQ - bimQ) },
          quantum: null,
          dedupKey: `om:${projectKey}:${el}`,
        });
      }
    }

    // ── 4. cost-variance (latest cost-plan estimate vs BOQ total) ──
    const estimate = await this.estimates.findOne({
      where: { projectBusinessKey: projectKey, isCurrent: true },
      order: { createdAt: 'DESC' },
    });
    if (estimate && boq?.totalAmount) {
      const est = Number(estimate.totalAmount);
      const boqTotal = Number(boq.totalAmount);
      if (est > 0 && boqTotal > 0) {
        const variance = (boqTotal - est) / est;
        if (Math.abs(variance) >= this.COST_VARIANCE_WARN) {
          drafts.push({
            findingType: 'cost-variance',
            severity: Math.abs(variance) >= 0.2 ? 'critical' : 'warning',
            title: `Cost variance: BOQ vs ${estimate.stage} estimate ${(variance * 100).toFixed(0)}%`,
            description: `BOQ total ${round2(boqTotal)} vs ${estimate.stage} estimate ${round2(est)} (${(variance * 100).toFixed(1)}% ${variance > 0 ? 'over' : 'under'} budget).`,
            refs: { boqTotal: round2(boqTotal), estimateTotal: round2(est), estimateStage: estimate.stage, variancePct: round4(variance) },
            quantum: round2(boqTotal - est),
            dedupKey: `cv:${projectKey}:${estimate.stage}`,
          });
        }
      }
    }

    const persisted = await this.persist(projectKey, drafts);
    const counts: Record<string, number> = {};
    for (const f of persisted) counts[f.findingType] = (counts[f.findingType] ?? 0) + 1;
    this.logger.log(`QS governance for ${projectKey}: ${persisted.length} finding(s) ${JSON.stringify(counts)}`);
    return { projectKey, findings: persisted, counts };
  }

  list(projectKey: string, status?: string): Promise<QsFinding[]> {
    const where: Record<string, unknown> = { projectBusinessKey: projectKey };
    if (status) where.status = status;
    return this.findings.find({ where, order: { createdAt: 'DESC' } });
  }

  async setStatus(id: string, status: string): Promise<QsFinding> {
    const f = await this.findings.findOne({ where: { id } });
    if (!f) throw new Error(`QS finding ${id} not found`);
    f.status = status;
    return this.findings.save(f);
  }

  // ───────────────────────── internals ─────────────────────────

  /** Upsert by dedupKey: refresh existing open rows, insert new ones. */
  private async persist(projectKey: string, drafts: DraftFinding[]): Promise<QsFinding[]> {
    const existing = await this.findings.find({ where: { projectBusinessKey: projectKey } });
    const byKey = new Map(existing.map((e) => [e.dedupKey, e]));
    const out: QsFinding[] = [];
    for (const d of drafts) {
      const prior = byKey.get(d.dedupKey);
      if (prior) {
        // Refresh content but preserve a human's reviewed/dismissed status.
        prior.severity = d.severity;
        prior.title = d.title;
        prior.description = d.description;
        prior.refs = d.refs;
        prior.quantum = d.quantum !== null ? String(d.quantum) : null;
        out.push(await this.findings.save(prior));
      } else {
        out.push(await this.findings.save(this.findings.create({
          projectBusinessKey: projectKey,
          findingType: d.findingType,
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

  private async latestBoqByPrefix(projectKey: string): Promise<BoQ | null> {
    const rows = await this.boqs
      .createQueryBuilder('b')
      .where('b.isCurrent = 1')
      .andWhere('b.businessKey LIKE :k', { k: `%${projectKey}%` })
      .orderBy('b.createdAt', 'DESC')
      .getMany();
    return rows[0] ?? null;
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const trim = (s: string): string => (s.length > 60 ? `${s.slice(0, 57)}…` : s);
