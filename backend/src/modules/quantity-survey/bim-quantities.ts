import { classifyElement, ClassificationStandard } from './cost-classification';

/** A BIM element count block as stored on a `bim-model` ProjectRecord. */
export interface BimCounts {
  walls: number; slabs: number; columns: number; beams: number;
  doors: number; windows: number; spaces: number; storeys: number;
}

export interface DerivedQuantity {
  element: string;
  label: string;
  code: string;
  standard: ClassificationStandard;
  unit: string;
  /** Derived takeoff quantity (honest: a deterministic estimate from counts). */
  quantity: number;
  basis: string;
}

/**
 * Derive indicative element quantities from BIM element COUNTS (Mr. Ayham's
 * BIM → Quantity step). The IFC parser yields instance counts, not measured
 * areas/volumes, so we apply documented per-instance nominal sizes to produce
 * an order-of-magnitude takeoff — clearly labelled as derived, never presented
 * as measured. This feeds Cost Classification + the QS quantity-variance check.
 */
export function deriveQuantitiesFromBim(
  counts: BimCounts,
  standard: ClassificationStandard = 'NRM',
): DerivedQuantity[] {
  const storeyArea = 1; // unit-area proxy; counts drive the relative magnitudes
  // Nominal per-instance sizes (deterministic QS takeoff factors).
  const rows: Array<{ key: keyof BimCounts; label: string; unit: string; per: number }> = [
    { key: 'walls', label: 'external wall', unit: 'm2', per: 12 },       // ~12 m² per wall instance
    { key: 'slabs', label: 'upper floor slab', unit: 'm2', per: 120 },   // ~120 m² per slab
    { key: 'columns', label: 'frame column', unit: 'm2', per: 9 },       // formwork-equivalent
    { key: 'beams', label: 'frame beam', unit: 'm2', per: 6 },
    { key: 'doors', label: 'internal door', unit: 'nr', per: 1 },
    { key: 'windows', label: 'window', unit: 'nr', per: 1 },
    { key: 'spaces', label: 'internal finishes space', unit: 'm2', per: 25 },
  ];
  const out: DerivedQuantity[] = [];
  for (const r of rows) {
    const count = counts[r.key] ?? 0;
    if (count <= 0) continue;
    const cls = classifyElement(r.label, standard);
    out.push({
      element: cls.element,
      label: cls.label,
      code: cls.code,
      standard,
      unit: r.unit,
      quantity: Math.round(count * r.per * storeyArea * 100) / 100,
      basis: `${count} × ${r.per} ${r.unit}/instance (BIM count → takeoff)`,
    });
  }
  return out;
}
