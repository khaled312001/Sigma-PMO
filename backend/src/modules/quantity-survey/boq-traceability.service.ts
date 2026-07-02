import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  BoQ,
  BoqItem,
  ClashItem,
  CostEstimate,
  LifecycleLedgerEntry,
  QsFinding,
} from '../canonical/entities';

/** The `boq:` prefix the BoQ ingester binds (`boq:<projectKey>`). */
const BOQ_BUSINESS_KEY_PREFIX = 'boq:';

/** One quantity/cost impact row (a clash resolution or a QS variation finding). */
export interface BoqImpact {
  kind: 'clash' | 'variation';
  ref: string;
  costImpact: number | null;
  timeImpactDays: number | null;
  note: string;
}

/**
 * The assembled per-line traceability panel — answers, for one BOQ line:
 * where the quantity came from (which BIM element/origin), how it is
 * classified (NRM/UniFormat/…), which pricing library/source set the rate,
 * and what clash/variation impacts touch its cost. Plus the append-only
 * ledger chain for the subject. Deterministic; null when unknown.
 */
export interface BoqTraceabilityPanel {
  item: {
    id: string;
    itemNumber: string;
    description: string;
    unit: string;
    quantity: string;
    unitRate: string;
    amount: string;
    activityRef: string | null;
  };
  quantitySource: {
    originType: string | null;
    originRef: string | null;
    bimElementGuid: string | null;
    method: string | null;
  };
  classification: { standard: string | null; code: string | null };
  pricing: { unitRate: string; currency: string; library: string | null; source: string | null };
  impacts: BoqImpact[];
  ledger: LifecycleLedgerEntry[];
}

/**
 * BoqTraceabilityService — assembles the per-BOQ-item traceability panel
 * (Req 5, Mr. Ayham acceptance: "traceability panel لكل بند BOQ يربطه بـ BIM
 * element + cost item + سعر/مصدر التسعير + أثر clash أو variation على
 * التكلفة"). Reads — never invents — from the BoqItem row, the lifecycle
 * ledger (origin/BIM element/change trail), the matching CostEstimate element
 * (classification + pricing source), QS variation findings, and clash items
 * whose chosen/proposed option impacts this line. Nulls where data is absent.
 */
@Injectable()
export class BoqTraceabilityService {
  constructor(
    @InjectRepository(BoqItem) private readonly items: Repository<BoqItem>,
    @InjectRepository(BoQ) private readonly boqs: Repository<BoQ>,
    @InjectRepository(LifecycleLedgerEntry) private readonly ledger: Repository<LifecycleLedgerEntry>,
    @InjectRepository(QsFinding) private readonly findings: Repository<QsFinding>,
    @InjectRepository(CostEstimate) private readonly estimates: Repository<CostEstimate>,
    @InjectRepository(ClashItem) private readonly clashes: Repository<ClashItem>,
  ) {}

  /**
   * Resolve the BOQ line the caller means, tolerating the most common mistake
   * (passing a cost-estimate id instead of a BOQ-item id). Accepts either:
   *   - a BoqItem UUID (the `items[].id` from `GET /boq/:projectKey/current`); or
   *   - a plain `itemNumber` (e.g. "1.1") together with `?projectKey=` — resolved
   *     within that project's CURRENT BoQ.
   * Throws a 400/404 with an explicit, actionable message so the id is never
   * silently wrong (Mr. Ayham acceptance 2026-07-01, BOQ-traceability clarity).
   */
  private async resolveItem(idOrNumber: string, projectKey?: string): Promise<BoqItem> {
    // 1. Direct id lookup first — the happy path (items[].id from /boq/current).
    const byId = await this.items.findOne({ where: { id: idOrNumber } });
    if (byId) return byId;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrNumber);
    if (isUuid) {
      // A UUID that is not a BOQ item — the common mix-up is a cost-estimate id.
      const estimate = await this.estimates.findOne({ where: { id: idOrNumber } });
      if (estimate) {
        throw new NotFoundException(
          `"${idOrNumber}" is a cost-estimate id, not a BOQ item id. BOQ item ids come from ` +
            `GET /boq/:projectKey/current → items[].id. (Cost estimates live at GET /quantity-survey/estimates/:id.)`,
        );
      }
      throw new NotFoundException(
        `BOQ item "${idOrNumber}" not found. BOQ item ids come from GET /boq/:projectKey/current → items[].id.`,
      );
    }

    // 2. Not a UUID and not a known id → treat as an itemNumber; needs the project.
    if (!projectKey) {
      throw new BadRequestException(
        `"${idOrNumber}" is not a BOQ item id (UUID). To look up by item number, add ?projectKey=… ` +
          `(e.g. /quantity-survey/boq/${idOrNumber}/traceability?projectKey=P-1000).`,
      );
    }
    const boq = await this.boqs.findOne({
      where: { businessKey: `${BOQ_BUSINESS_KEY_PREFIX}${projectKey}`, isCurrent: true },
    });
    if (!boq) {
      throw new NotFoundException(`No current BoQ for project "${projectKey}".`);
    }
    const byNumber = await this.items.findOne({ where: { boqId: boq.id, itemNumber: idOrNumber } });
    if (byNumber) return byNumber;
    const available = await this.items.find({ where: { boqId: boq.id }, order: { itemNumber: 'ASC' } });
    throw new NotFoundException(
      `BOQ item number "${idOrNumber}" not found in project "${projectKey}". ` +
        `Available item numbers: ${available.map((i) => i.itemNumber).join(', ') || '(none)'}.`,
    );
  }

  /**
   * Build the traceability panel for one BOQ line. Resolves the owning BoQ to
   * derive the project key (from `boq:<projectKey>`), then assembles every
   * section from the canonical stores. Match keys, in priority order, are the
   * line's `itemNumber` and its `activityRef`.
   */
  async panel(idOrNumber: string, projectKeyHint?: string): Promise<BoqTraceabilityPanel> {
    const item = await this.resolveItem(idOrNumber, projectKeyHint);

    const boq = await this.boqs.findOne({ where: { id: item.boqId } });
    const projectKey = boq?.businessKey?.startsWith(BOQ_BUSINESS_KEY_PREFIX)
      ? boq.businessKey.slice(BOQ_BUSINESS_KEY_PREFIX.length)
      : (boq?.businessKey ?? null);
    const currency = boq?.currency ?? 'AED';

    // ── Ledger chain for this subject (itemNumber is the canonical subjectKey;
    // some importers key on the activityRef instead — accept either). ──
    const subjectKeys = [item.itemNumber, item.activityRef].filter(
      (k): k is string => !!k,
    );
    const ledger = projectKey
      ? await this.ledger.find({
          where: subjectKeys.map((subjectKey) => ({ projectBusinessKey: projectKey, subjectKey })),
          order: { createdAt: 'ASC' },
        })
      : [];

    // Origin / BIM element: the explicit column wins; else the earliest ledger
    // entry that names an origin (the head of the quantity chain).
    const originRow =
      ledger.find((r) => r.dimension === 'quantity' && r.originType) ?? ledger.find((r) => r.originType) ?? null;
    const bimElementGuid =
      item.bimElementGuid ?? this.bimGuidFromEvidence(originRow) ?? null;

    // ── Matching CostEstimate element (classification + pricing source). Match
    // by the explicit classification code, else by the element/code text. ──
    const element = projectKey ? await this.matchEstimateElement(projectKey, item) : null;

    const classification = {
      standard: item.classificationStandard ?? (element?.standard as string | undefined) ?? null,
      code: item.classificationCode ?? (element?.code as string | undefined) ?? null,
    };

    const pricing = {
      unitRate: item.unitRate,
      currency,
      library: item.pricingLibrary ?? null,
      source: (element?.source as string | undefined) ?? originRow?.originType ?? null,
    };

    const impacts = projectKey ? await this.assembleImpacts(projectKey, item) : [];

    return {
      item: {
        id: item.id,
        itemNumber: item.itemNumber,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        unitRate: item.unitRate,
        amount: item.amount,
        activityRef: item.activityRef,
      },
      quantitySource: {
        originType: originRow?.originType ?? null,
        originRef: originRow?.originRef ?? null,
        bimElementGuid,
        method: (element?.method as string | undefined) ?? null,
      },
      classification,
      pricing,
      impacts,
      ledger,
    };
  }

  /**
   * Pull a BIM element GUID out of a ledger row's evidence refs, when one is
   * recorded as `[{ type: 'bim-element', ref }]` or carried on `originRef` for
   * a BIM-origin row. Returns null otherwise (never fabricates a GUID).
   */
  private bimGuidFromEvidence(row: LifecycleLedgerEntry | null): string | null {
    if (!row) return null;
    if (Array.isArray(row.evidenceRefs)) {
      const hit = row.evidenceRefs.find(
        (e) => typeof e?.type === 'string' && /bim|element|guid/i.test(String(e.type)) && e.ref,
      );
      if (hit?.ref) return String(hit.ref);
    }
    if (row.originType === 'bim-model' && row.originRef) return row.originRef;
    return null;
  }

  /**
   * Find the classified cost element that matches this line in the project's
   * current cost estimates. Prefers a code match (explicit or text), else an
   * element/description text match. Returns the element object or null.
   */
  private async matchEstimateElement(
    projectKey: string,
    item: BoqItem,
  ): Promise<Record<string, unknown> | null> {
    const estimates = await this.estimates.find({
      where: { projectBusinessKey: projectKey, isCurrent: true },
      order: { createdAt: 'DESC' },
    });
    const desc = item.description.toLowerCase();
    for (const est of estimates) {
      const elements = Array.isArray(est.elements) ? est.elements : [];
      // 1) explicit classification code on the line.
      if (item.classificationCode) {
        const byCode = elements.find((e) => String(e.code ?? '') === item.classificationCode);
        if (byCode) return { ...byCode, method: est.method };
      }
      // 2) element/label text appears in the line description.
      const byText = elements.find((e) => {
        const el = String(e.element ?? '').toLowerCase();
        const label = String(e.label ?? '').toLowerCase();
        return (el && desc.includes(el.replace(/_/g, ' '))) || (label && desc.includes(label.toLowerCase()));
      });
      if (byText) return { ...byText, method: est.method };
    }
    return null;
  }

  /**
   * Assemble the cost/time impacts on this line: QS variation findings that
   * reference it (cost-variance / quantity-cost-mismatch carry a quantum) and
   * clash items whose chosen — else most expensive proposed — option affects
   * the same activity. Clash cost is honoured only when the option carries a
   * real number (the persona never invents a cost).
   */
  private async assembleImpacts(projectKey: string, item: BoqItem): Promise<BoqImpact[]> {
    const impacts: BoqImpact[] = [];

    // QS variation findings referencing this line (by itemNumber or activityRef).
    const findings = await this.findings.find({
      where: { projectBusinessKey: projectKey },
      order: { createdAt: 'DESC' },
    });
    for (const f of findings) {
      if (!this.findingTouchesItem(f, item)) continue;
      impacts.push({
        kind: 'variation',
        ref: f.id,
        costImpact: f.quantum !== null ? Number(f.quantum) : null,
        timeImpactDays: null,
        note: `${f.findingType}: ${f.title}`,
      });
    }

    // Clash items whose resolution revised this line's activity.
    if (item.activityRef) {
      const clashes = await this.clashes.find({
        where: { projectBusinessKey: projectKey, linkedActivityBusinessKey: item.activityRef },
        order: { createdAt: 'DESC' },
      });
      for (const c of clashes) {
        const opt = this.chosenOrCostliestOption(c);
        impacts.push({
          kind: 'clash',
          ref: c.clashRef,
          costImpact: opt?.costImpactAED ?? null,
          timeImpactDays: opt?.timeImpactDays ?? null,
          note: opt
            ? `${c.severity} clash — option "${opt.label}": ${opt.scopeImpact}`
            : `${c.severity} clash — ${c.description}`,
        });
      }
    }

    return impacts;
  }

  /** Whether a QS finding's refs/description point at this BOQ line. */
  private findingTouchesItem(f: QsFinding, item: BoqItem): boolean {
    const refs = (f.refs ?? {}) as Record<string, unknown>;
    const keys = new Set(
      [refs.itemNumber, refs.subjectKey, refs.boqItemNumber, refs.activityRef]
        .filter((v) => v != null)
        .map((v) => String(v)),
    );
    if (keys.has(item.itemNumber) || (item.activityRef && keys.has(item.activityRef))) return true;
    return false;
  }

  /**
   * The chosen clash option, else the costliest proposed option (so the panel
   * surfaces the worst-case cost exposure). Null when no options carry data.
   */
  private chosenOrCostliestOption(
    clash: ClashItem,
  ): { label: string; timeImpactDays: number; costImpactAED: number | null; scopeImpact: string } | null {
    const options = Array.isArray(clash.proposedOptions) ? clash.proposedOptions : [];
    if (options.length === 0) return null;
    if (clash.chosenOptionIndex != null && options[clash.chosenOptionIndex]) {
      return options[clash.chosenOptionIndex];
    }
    return [...options].sort((a, b) => (b.costImpactAED ?? 0) - (a.costImpactAED ?? 0))[0] ?? null;
  }
}
