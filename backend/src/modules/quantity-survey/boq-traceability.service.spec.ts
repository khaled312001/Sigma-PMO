import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';

import {
  BoQ,
  BoqItem,
  ClashItem,
  CostEstimate,
  LifecycleLedgerEntry,
  QsFinding,
} from '../canonical/entities';
import { BoqTraceabilityService } from './boq-traceability.service';

/**
 * In-memory repository double — `find`/`findOne` resolve against a fixed row
 * set using the `where` filter the service passes (equality match, with array
 * `where` treated as OR). No real DB: the assembly logic is pure read + shape.
 */
function repoOf<T>(rows: T[]): Repository<T> {
  const matches = (row: T, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => (row as Record<string, unknown>)[k] === v);
  return {
    find: jest.fn(async (opts?: { where?: unknown }) => {
      const where = opts?.where;
      if (!where) return [...rows];
      const clauses = Array.isArray(where) ? where : [where];
      return rows.filter((r) => clauses.some((c) => matches(r, c as Record<string, unknown>)));
    }),
    findOne: jest.fn(async (opts: { where: Record<string, unknown> }) =>
      rows.find((r) => matches(r, opts.where)) ?? null,
    ),
  } as unknown as Repository<T>;
}

describe('BoqTraceabilityService', () => {
  const projectKey = 'P-1000';

  // A BOQ line for concrete frame, linked to activity ACT-2.1, classified to NRM "2".
  const item: BoqItem = {
    id: 'item-1',
    createdAt: new Date(),
    boqId: 'boq-1',
    itemNumber: '2.1',
    description: 'Reinforced concrete frame to first floor',
    unit: 'm3',
    quantity: '120.0000',
    unitRate: '480.00',
    amount: '57600.00',
    activityRef: 'ACT-2.1',
    bimElementGuid: null,
    classificationStandard: null,
    classificationCode: null,
    pricingLibrary: 'sigma-benchmark',
  } as BoqItem;

  const boq = {
    id: 'boq-1',
    businessKey: `boq:${projectKey}`,
    currency: 'AED',
  } as BoQ;

  // Quantity-chain ledger entry: origin is the BIM model, with a BIM element GUID in evidence.
  const ledgerRows: LifecycleLedgerEntry[] = [
    {
      id: 'led-1',
      createdAt: new Date('2026-01-01'),
      projectBusinessKey: projectKey,
      dimension: 'quantity',
      subjectKey: '2.1',
      subjectLabel: 'Concrete frame',
      stage: 'bim',
      value: '120.0000',
      unit: 'm3',
      currency: null,
      originType: 'bim-model',
      originRef: 'IFC-MODEL-7',
      changeReason: null,
      approvedBy: null,
      evidenceRefs: [{ type: 'bim-element', ref: 'GUID-3aF9-EL-0012', note: 'concrete frame' }],
      supersedesId: null,
      isCurrent: true,
      recordedBy: null,
      journeyCorrelationId: null,
    } as LifecycleLedgerEntry,
  ];

  // Cost estimate carrying the matching classified element (frame → NRM "2").
  const estimates: CostEstimate[] = [
    {
      id: 'est-1',
      createdAt: new Date(),
      projectBusinessKey: projectKey,
      stage: 'cost-plan',
      title: 'Cost plan',
      standard: 'NRM',
      method: 'bim-quantities',
      currency: 'AED',
      isCurrent: true,
      elements: [
        { element: 'frame', label: 'Frame', code: '2', standard: 'NRM', rate: 480, amount: 57600, source: 'sigma-benchmark' },
        { element: 'roof', label: 'Roof', code: '4', standard: 'NRM', rate: 300, amount: 12000, source: 'sigma-benchmark' },
      ],
    } as unknown as CostEstimate,
  ];

  // A QS cost-variance finding referencing this line + a clash on the same activity.
  const findings: QsFinding[] = [
    {
      id: 'find-1',
      createdAt: new Date(),
      projectBusinessKey: projectKey,
      findingType: 'cost-variance',
      severity: 'warning',
      title: 'Frame rate above benchmark band',
      description: 'Unit rate 12% above the elemental benchmark.',
      refs: { itemNumber: '2.1' },
      quantum: '6900.00',
      status: 'open',
      dedupKey: 'x',
    } as QsFinding,
  ];

  const clashes: ClashItem[] = [
    {
      id: 'clash-1',
      createdAt: new Date(),
      projectBusinessKey: projectKey,
      sourceFileId: 'sf-1',
      clashRef: 'CL-0007',
      disciplinesInvolved: ['structural', 'mechanical'],
      severity: 'major',
      description: 'Duct penetrates frame beam',
      proposedOptions: [
        { label: 'A — reroute duct', timeImpactDays: 3, costImpactAED: null, scopeImpact: 'MEP rerouting' },
        { label: 'B — sleeve + reinforce', timeImpactDays: 1, costImpactAED: 8200, scopeImpact: 'Structural sleeve' },
      ],
      chosenOptionIndex: 1,
      linkedActivityBusinessKey: 'ACT-2.1',
    } as ClashItem,
  ];

  function build(overrides?: {
    items?: BoqItem[];
    ledger?: LifecycleLedgerEntry[];
    findings?: QsFinding[];
    clashes?: ClashItem[];
    estimates?: CostEstimate[];
  }): BoqTraceabilityService {
    return new BoqTraceabilityService(
      repoOf(overrides?.items ?? [item]),
      repoOf([boq]),
      repoOf(overrides?.ledger ?? ledgerRows),
      repoOf(overrides?.findings ?? findings),
      repoOf(overrides?.estimates ?? estimates),
      repoOf(overrides?.clashes ?? clashes),
    );
  }

  it('assembles every section for a fully-linked line', async () => {
    const panel = await build().panel('item-1');

    // Item echo.
    expect(panel.item.itemNumber).toBe('2.1');
    expect(panel.item.amount).toBe('57600.00');
    expect(panel.item.activityRef).toBe('ACT-2.1');

    // Quantity source: origin + BIM element GUID pulled from the ledger evidence.
    expect(panel.quantitySource.originType).toBe('bim-model');
    expect(panel.quantitySource.originRef).toBe('IFC-MODEL-7');
    expect(panel.quantitySource.bimElementGuid).toBe('GUID-3aF9-EL-0012');
    expect(panel.quantitySource.method).toBe('bim-quantities');

    // Classification resolved from the matching cost-estimate element.
    expect(panel.classification.standard).toBe('NRM');
    expect(panel.classification.code).toBe('2');

    // Pricing: rate + the explicit library + the estimate source.
    expect(panel.pricing.unitRate).toBe('480.00');
    expect(panel.pricing.currency).toBe('AED');
    expect(panel.pricing.library).toBe('sigma-benchmark');
    expect(panel.pricing.source).toBe('sigma-benchmark');

    // Impacts: one variation (the QS finding) + one clash (chosen option B).
    const variation = panel.impacts.find((i) => i.kind === 'variation');
    expect(variation?.costImpact).toBe(6900);
    const clash = panel.impacts.find((i) => i.kind === 'clash');
    expect(clash?.ref).toBe('CL-0007');
    expect(clash?.costImpact).toBe(8200);
    expect(clash?.timeImpactDays).toBe(1);

    // Ledger chain is returned.
    expect(panel.ledger).toHaveLength(1);
    expect(panel.ledger[0].id).toBe('led-1');
  });

  it('nulls every derived field when no provenance exists (never fabricates)', async () => {
    const bare = { ...item, pricingLibrary: null } as BoqItem;
    const panel = await build({
      items: [bare],
      ledger: [],
      findings: [],
      clashes: [],
      estimates: [],
    }).panel('item-1');

    expect(panel.quantitySource.originType).toBeNull();
    expect(panel.quantitySource.bimElementGuid).toBeNull();
    expect(panel.quantitySource.method).toBeNull();
    expect(panel.classification.standard).toBeNull();
    expect(panel.classification.code).toBeNull();
    expect(panel.pricing.library).toBeNull();
    expect(panel.pricing.source).toBeNull();
    expect(panel.impacts).toEqual([]);
    expect(panel.ledger).toEqual([]);
    // Rate/currency still echo the line + BoQ header.
    expect(panel.pricing.unitRate).toBe('480.00');
    expect(panel.pricing.currency).toBe('AED');
  });

  it('prefers the explicit provenance columns over derived sources', async () => {
    const explicit = {
      ...item,
      bimElementGuid: 'GUID-EXPLICIT',
      classificationStandard: 'UNIFORMAT',
      classificationCode: 'B1010',
    } as BoqItem;
    const panel = await build({ items: [explicit] }).panel('item-1');

    expect(panel.quantitySource.bimElementGuid).toBe('GUID-EXPLICIT');
    expect(panel.classification.standard).toBe('UNIFORMAT');
    expect(panel.classification.code).toBe('B1010');
  });

  it('uses the costliest proposed option when no clash option is chosen', async () => {
    const undecided = [{ ...clashes[0], chosenOptionIndex: null }] as ClashItem[];
    const panel = await build({ clashes: undecided }).panel('item-1');
    const clash = panel.impacts.find((i) => i.kind === 'clash');
    // Option B (8200) is costlier than A (null → 0).
    expect(clash?.costImpact).toBe(8200);
  });

  it('throws NotFound for an unknown BOQ item id', async () => {
    await expect(build().panel('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
