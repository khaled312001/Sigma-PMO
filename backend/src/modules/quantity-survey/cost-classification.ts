/**
 * The Sigma Global Cost Classification Framework (Mr. Ayham, 2026-06-12).
 *
 * A standardized quantity + cost classification engine — Sigma's OWN mapping
 * structure, NOT a commercial cost database (no RSMeans / subscription feeds).
 * It maps extracted quantities to internationally recognized standards so the
 * SAME element structure flows through Feasibility → Cost Planning → Quantity
 * Surveying → BOQ → Procurement → Cost Governance → Project Controls.
 *
 * Design: a canonical Sigma element set is the hub; each standard is a spoke
 * with its own code for that element. `classifyElement()` resolves free-text
 * (a BIM family, a drawing label, a BOQ description) to a canonical element via
 * deterministic keyword rules, then `codeFor()` returns the standard's code.
 * Adding a standard = a new column in the map; adding an element = a new row.
 * External cost databases remain a clean future extension on top of this hub.
 */

export const CLASSIFICATION_FRAMEWORK_VERSION = 'sigma-cost-classification-v1';

export type ClassificationStandard = 'NRM' | 'UNIFORMAT' | 'MASTERFORMAT' | 'CESMM';

export const CLASSIFICATION_STANDARDS: Array<{ key: ClassificationStandard; label: string; description: string }> = [
  { key: 'NRM', label: 'NRM (New Rules of Measurement)', description: 'RICS elemental cost planning + measurement (NRM1/NRM2).' },
  { key: 'UNIFORMAT', label: 'UniFormat', description: 'ASTM/CSI elemental classification (system-based).' },
  { key: 'MASTERFORMAT', label: 'MasterFormat', description: 'CSI work-results classification (trade/work sections).' },
  { key: 'CESMM', label: 'CESMM (Civil Engineering SMM)', description: 'ICE civil-engineering method of measurement classes.' },
];

/** The canonical Sigma elements — the standard-agnostic hub of the framework. */
export type CanonicalElement =
  | 'preliminaries'
  | 'substructure'
  | 'frame'
  | 'upper_floors'
  | 'roof'
  | 'stairs'
  | 'external_walls'
  | 'windows_external_doors'
  | 'internal_walls_partitions'
  | 'internal_doors'
  | 'wall_finishes'
  | 'floor_finishes'
  | 'ceiling_finishes'
  | 'fittings_furnishings'
  | 'sanitary'
  | 'services_mechanical'
  | 'services_electrical'
  | 'services_protective'
  | 'external_works'
  | 'drainage'
  | 'other';

interface ElementDef {
  element: CanonicalElement;
  label: string;
  /** Lowercase keyword fragments that classify a free-text label to this element. */
  keywords: string[];
  /** Per-standard code for this element. */
  codes: Record<ClassificationStandard, string>;
  /** Typical unit of measure for quantities of this element. */
  unit: string;
  /** Indicative share of building cost (cost-planning weighting, fraction). */
  costShare: number;
}

/**
 * The hub table. Codes follow each standard's published top-level structure
 * (NRM1 element groups, UniFormat Level-2/3, MasterFormat divisions, CESMM
 * classes). They are the recognized reference codes — not priced data.
 */
export const ELEMENT_LIBRARY: ElementDef[] = [
  { element: 'preliminaries', label: 'Preliminaries / Main Contractor Cost', unit: 'item', costShare: 0.12,
    keywords: ['prelim', 'mobilisation', 'site setup', 'overhead', 'general requirement'],
    codes: { NRM: '0.1', UNIFORMAT: 'Z10', MASTERFORMAT: '01 00 00', CESMM: 'A' } },
  { element: 'substructure', label: 'Substructure', unit: 'm2', costShare: 0.1,
    keywords: ['substructure', 'foundation', 'footing', 'pile', 'raft', 'basement', 'excavation', 'ground beam'],
    codes: { NRM: '1', UNIFORMAT: 'A', MASTERFORMAT: '31 00 00', CESMM: 'E' } },
  { element: 'frame', label: 'Frame', unit: 'm2', costShare: 0.11,
    keywords: ['frame', 'column', 'beam', 'structural steel', 'rc frame', 'girder', 'truss'],
    codes: { NRM: '2.1', UNIFORMAT: 'B1010', MASTERFORMAT: '03 30 00', CESMM: 'F' } },
  { element: 'upper_floors', label: 'Upper Floors', unit: 'm2', costShare: 0.06,
    keywords: ['upper floor', 'slab', 'floor slab', 'suspended floor', 'deck'],
    codes: { NRM: '2.2', UNIFORMAT: 'B1010', MASTERFORMAT: '03 30 00', CESMM: 'F' } },
  { element: 'roof', label: 'Roof', unit: 'm2', costShare: 0.05,
    keywords: ['roof', 'roofing', 'waterproofing', 'parapet', 'skylight'],
    codes: { NRM: '2.3', UNIFORMAT: 'B1020', MASTERFORMAT: '07 00 00', CESMM: 'G' } },
  { element: 'stairs', label: 'Stairs & Ramps', unit: 'nr', costShare: 0.02,
    keywords: ['stair', 'ramp', 'step', 'staircase'],
    codes: { NRM: '2.4', UNIFORMAT: 'B1080', MASTERFORMAT: '05 51 00', CESMM: 'F' } },
  { element: 'external_walls', label: 'External Walls', unit: 'm2', costShare: 0.07,
    keywords: ['external wall', 'facade', 'cladding', 'curtain wall', 'envelope', 'masonry wall'],
    codes: { NRM: '2.5', UNIFORMAT: 'B2010', MASTERFORMAT: '04 20 00', CESMM: 'U' } },
  { element: 'windows_external_doors', label: 'Windows & External Doors', unit: 'nr', costShare: 0.04,
    keywords: ['window', 'external door', 'glazing', 'shopfront', 'louvre'],
    codes: { NRM: '2.6', UNIFORMAT: 'B2020', MASTERFORMAT: '08 00 00', CESMM: 'U' } },
  { element: 'internal_walls_partitions', label: 'Internal Walls & Partitions', unit: 'm2', costShare: 0.04,
    keywords: ['internal wall', 'partition', 'blockwork', 'drywall', 'plasterboard'],
    codes: { NRM: '2.7', UNIFORMAT: 'C1010', MASTERFORMAT: '09 20 00', CESMM: 'U' } },
  { element: 'internal_doors', label: 'Internal Doors', unit: 'nr', costShare: 0.02,
    keywords: ['internal door', 'door set', 'doorset', 'ironmongery'],
    codes: { NRM: '2.8', UNIFORMAT: 'C1020', MASTERFORMAT: '08 10 00', CESMM: 'U' } },
  { element: 'wall_finishes', label: 'Wall Finishes', unit: 'm2', costShare: 0.03,
    keywords: ['wall finish', 'paint', 'plaster', 'tiling', 'render'],
    codes: { NRM: '3.1', UNIFORMAT: 'C3010', MASTERFORMAT: '09 90 00', CESMM: 'U' } },
  { element: 'floor_finishes', label: 'Floor Finishes', unit: 'm2', costShare: 0.03,
    keywords: ['floor finish', 'screed', 'flooring', 'carpet', 'vinyl', 'floor tile'],
    codes: { NRM: '3.2', UNIFORMAT: 'C3020', MASTERFORMAT: '09 60 00', CESMM: 'U' } },
  { element: 'ceiling_finishes', label: 'Ceiling Finishes', unit: 'm2', costShare: 0.02,
    keywords: ['ceiling', 'soffit', 'false ceiling', 'suspended ceiling'],
    codes: { NRM: '3.3', UNIFORMAT: 'C3030', MASTERFORMAT: '09 50 00', CESMM: 'U' } },
  { element: 'fittings_furnishings', label: 'Fittings, Furnishings & Equipment', unit: 'item', costShare: 0.03,
    keywords: ['fitting', 'furnishing', 'joinery', 'fixed furniture', 'equipment', 'ff&e', 'casework'],
    codes: { NRM: '4', UNIFORMAT: 'E1020', MASTERFORMAT: '12 00 00', CESMM: 'Z' } },
  { element: 'sanitary', label: 'Sanitary Installations', unit: 'nr', costShare: 0.02,
    keywords: ['sanitary', 'wc', 'washbasin', 'toilet', 'sink', 'plumbing fixture'],
    codes: { NRM: '5.1', UNIFORMAT: 'D2010', MASTERFORMAT: '22 40 00', CESMM: 'Y' } },
  { element: 'services_mechanical', label: 'Mechanical Services (HVAC/Plumbing)', unit: 'm2', costShare: 0.1,
    keywords: ['mechanical', 'hvac', 'ducting', 'chiller', 'ahu', 'pipework', 'plumbing', 'ventilation', 'cooling'],
    codes: { NRM: '5.6', UNIFORMAT: 'D30', MASTERFORMAT: '23 00 00', CESMM: 'Y' } },
  { element: 'services_electrical', label: 'Electrical Services', unit: 'm2', costShare: 0.08,
    keywords: ['electrical', 'power', 'lighting', 'cabling', 'switchgear', 'distribution board', 'lv'],
    codes: { NRM: '5.8', UNIFORMAT: 'D50', MASTERFORMAT: '26 00 00', CESMM: 'Y' } },
  { element: 'services_protective', label: 'Protective / Fire Services', unit: 'm2', costShare: 0.02,
    keywords: ['fire', 'sprinkler', 'fire alarm', 'fire fighting', 'protective', 'suppression'],
    codes: { NRM: '5.7', UNIFORMAT: 'D40', MASTERFORMAT: '21 00 00', CESMM: 'Y' } },
  { element: 'external_works', label: 'External Works / Site', unit: 'm2', costShare: 0.05,
    keywords: ['external work', 'landscape', 'paving', 'road', 'parking', 'fencing', 'hardstanding', 'site work'],
    codes: { NRM: '8', UNIFORMAT: 'G', MASTERFORMAT: '32 00 00', CESMM: 'R' } },
  { element: 'drainage', label: 'Drainage / Below-ground', unit: 'm', costShare: 0.02,
    keywords: ['drainage', 'sewer', 'manhole', 'soakaway', 'storm water', 'below ground'],
    codes: { NRM: '8.2', UNIFORMAT: 'G30', MASTERFORMAT: '33 40 00', CESMM: 'K' } },
  { element: 'other', label: 'Other / Unclassified', unit: 'item', costShare: 0.0,
    keywords: [],
    codes: { NRM: '9', UNIFORMAT: 'Z', MASTERFORMAT: '01 00 00', CESMM: 'Z' } },
];

const BY_ELEMENT = new Map<CanonicalElement, ElementDef>(ELEMENT_LIBRARY.map((e) => [e.element, e]));

export interface Classification {
  element: CanonicalElement;
  label: string;
  standard: ClassificationStandard;
  code: string;
  unit: string;
  /** 0–1 deterministic match confidence (1 = exact keyword, 0.4 = fallback 'other'). */
  confidence: number;
  matchedKeyword: string | null;
}

/**
 * Classify a free-text label (BIM family / drawing label / BOQ description) to
 * a canonical element + the selected standard's code. Deterministic: longest
 * keyword wins; no match → 'other' at low confidence (never invents a code).
 */
export function classifyElement(label: string, standard: ClassificationStandard = 'NRM'): Classification {
  const text = (label ?? '').toLowerCase();
  let best: { def: ElementDef; kw: string } | null = null;
  for (const def of ELEMENT_LIBRARY) {
    for (const kw of def.keywords) {
      if (text.includes(kw) && (!best || kw.length > best.kw.length)) best = { def, kw };
    }
  }
  const def = best?.def ?? BY_ELEMENT.get('other')!;
  return {
    element: def.element,
    label: def.label,
    standard,
    code: def.codes[standard],
    unit: def.unit,
    confidence: best ? Math.min(1, 0.6 + best.kw.length / 40) : 0.4,
    matchedKeyword: best?.kw ?? null,
  };
}

/** All standard codes for a canonical element (the cross-standard mapping row). */
export function codesForElement(element: CanonicalElement): Record<ClassificationStandard, string> | null {
  return BY_ELEMENT.get(element)?.codes ?? null;
}

/** The element library shaped for the API/UI (the full cross-standard matrix). */
export function classificationMatrix(): Array<{
  element: CanonicalElement;
  label: string;
  unit: string;
  costShare: number;
  codes: Record<ClassificationStandard, string>;
}> {
  return ELEMENT_LIBRARY.map(({ element, label, unit, costShare, codes }) => ({
    element, label, unit, costShare, codes,
  }));
}

export const lookupElement = (element: CanonicalElement): ElementDef | undefined => BY_ELEMENT.get(element);
