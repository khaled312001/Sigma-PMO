import { Injectable, Logger } from '@nestjs/common';

import { Aabb, IfcElement, IfcGeometryModel } from './ifc-geometry.service';
import { deriveSeverity } from './parsers/clash-excel.parser';

/** One clash produced by the geometric pass (pre-persistence shape). */
export interface GeometricClash {
  clashRef: string;
  disciplinesInvolved: string[];
  severity: 'critical' | 'major' | 'minor';
  description: string;
  elementGuidA: string | null;
  elementGuidB: string | null;
  location: { x: number; y: number; z: number };
  /** Penetration (hard clash, negative gap) or clearance distance in mm. */
  penetrationMm: number;
  /** `hard` (overlap) | `clearance` (within tolerance but not overlapping). */
  kind: 'hard' | 'clearance';
  extentConfidence: 'bbox' | 'extrusion' | 'placement';
}

export interface GeometricClashResult {
  clashes: GeometricClash[];
  stats: {
    elementsA: number;
    elementsB: number;
    pairsTested: number;
    hardClashes: number;
    clearanceClashes: number;
    /** Fraction of produced clashes that relied on the low-confidence placement box. */
    lowConfidenceClashes: number;
  };
}

/** Clearance tolerance (mm): boxes within this gap raise a soft "clearance" clash. */
const DEFAULT_CLEARANCE_MM = 25;

/**
 * GeometricClashService — native AABB interference detection over two parsed
 * IFC models (Task 1). It runs an axis-aligned bounding-box overlap +
 * proximity pass across the two models' elements, emits a clash for each
 * CROSS-DISCIPLINE pair that overlaps (hard clash) or sits within the
 * clearance tolerance (soft clash), and derives the clash centroid, penetration
 * depth and severity from the real geometry.
 *
 * Honesty contract: this is a simplified AABB detector, not Navisworks-grade
 * solid interference. It does not test mesh triangles; an AABB overlap is a
 * conservative proxy for a real clash. Pairs within the same discipline are
 * skipped (intra-discipline overlaps are usually adjacency, not clashes). Every
 * produced clash carries `extentConfidence` so a reviewer knows whether the box
 * came from real geometry (`bbox`/`extrusion`) or the placement fallback.
 */
@Injectable()
export class GeometricClashService {
  private readonly logger = new Logger(GeometricClashService.name);

  detect(
    modelA: IfcGeometryModel,
    modelB: IfcGeometryModel,
    opts?: { clearanceMm?: number },
  ): GeometricClashResult {
    const clearance = opts?.clearanceMm ?? DEFAULT_CLEARANCE_MM;
    const clashes: GeometricClash[] = [];
    let pairsTested = 0;
    let hard = 0;
    let clearanceCount = 0;
    let lowConf = 0;
    let n = 0;

    for (const a of modelA.elements) {
      const discA = disciplineOf(a.type);
      for (const b of modelB.elements) {
        const discB = disciplineOf(b.type);
        // Cross-discipline only — intra-discipline overlaps are adjacency.
        if (discA === discB) continue;
        pairsTested += 1;

        const gap = aabbGap(a.aabb, b.aabb);
        if (gap > clearance) continue;

        const kind: 'hard' | 'clearance' = gap < 0 ? 'hard' : 'clearance';
        // Penetration is the overlap depth (positive mm) for a hard clash, or
        // the clearance gap for a soft one.
        const penetrationMm = gap < 0 ? -gap : gap;
        const center = aabbOverlapCentre(a.aabb, b.aabb);
        const severity = deriveSeverity(kind === 'hard' ? 'hard clash' : 'clearance', penetrationMm);
        const confidence: 'bbox' | 'extrusion' | 'placement' =
          a.extentSource === 'placement' || b.extentSource === 'placement'
            ? 'placement'
            : a.extentSource === 'extrusion' || b.extentSource === 'extrusion'
              ? 'extrusion'
              : 'bbox';
        if (confidence === 'placement') lowConf += 1;

        n += 1;
        clashes.push({
          clashRef: `GEOM-${String(n).padStart(4, '0')}`,
          disciplinesInvolved: [discA, discB],
          severity,
          description: this.describe(a, b, discA, discB, kind, penetrationMm, confidence),
          elementGuidA: a.guid,
          elementGuidB: b.guid,
          location: center,
          penetrationMm: round2(penetrationMm),
          kind,
          extentConfidence: confidence,
        });
        if (kind === 'hard') hard += 1;
        else clearanceCount += 1;
      }
    }

    this.logger.log(
      `Geometric clash: ${clashes.length} clash(es) from ${modelA.elements.length}×${modelB.elements.length} ` +
        `elements (${hard} hard, ${clearanceCount} clearance, ${lowConf} low-confidence).`,
    );

    return {
      clashes,
      stats: {
        elementsA: modelA.elements.length,
        elementsB: modelB.elements.length,
        pairsTested,
        hardClashes: hard,
        clearanceClashes: clearanceCount,
        lowConfidenceClashes: lowConf,
      },
    };
  }

  private describe(
    a: IfcElement,
    b: IfcElement,
    discA: string,
    discB: string,
    kind: 'hard' | 'clearance',
    penetrationMm: number,
    confidence: string,
  ): string {
    const an = a.name ?? a.type;
    const bn = b.name ?? b.type;
    const verb = kind === 'hard' ? 'clashes with' : 'is within clearance of';
    return (
      `${an} (${discA}) ${verb} ${bn} (${discB}); ` +
      `${kind === 'hard' ? 'penetration' : 'gap'} ${penetrationMm.toFixed(1)} mm ` +
      `[extent: ${confidence}]`
    );
  }
}

// ───────────────────────── geometry helpers ─────────────────────────

/**
 * Signed gap between two AABBs: negative = overlap depth (the largest
 * penetration axis), positive = nearest-face separation distance.
 */
function aabbGap(a: Aabb, b: Aabb): number {
  const dx = axisGap(a.minX, a.maxX, b.minX, b.maxX);
  const dy = axisGap(a.minY, a.maxY, b.minY, b.maxY);
  const dz = axisGap(a.minZ, a.maxZ, b.minZ, b.maxZ);
  const overlapping = dx < 0 && dy < 0 && dz < 0;
  if (overlapping) {
    // Penetration depth = the shallowest axis overlap (min |negative|).
    return Math.max(dx, dy, dz);
  }
  // Separated on at least one axis → Euclidean distance of the positive gaps.
  const px = Math.max(0, dx);
  const py = Math.max(0, dy);
  const pz = Math.max(0, dz);
  return Math.sqrt(px * px + py * py + pz * pz);
}

/** Per-axis gap: negative = overlap on that axis, positive = separation. */
function axisGap(aMin: number, aMax: number, bMin: number, bMax: number): number {
  if (aMax < bMin) return bMin - aMax; // a left of b
  if (bMax < aMin) return aMin - bMax; // b left of a
  // Overlapping: depth is the smaller of the two penetration distances.
  return -Math.min(aMax - bMin, bMax - aMin);
}

/** Centre of the overlap region (or the midpoint of the nearest faces). */
function aabbOverlapCentre(a: Aabb, b: Aabb): { x: number; y: number; z: number } {
  return {
    x: round2((Math.max(a.minX, b.minX) + Math.min(a.maxX, b.maxX)) / 2),
    y: round2((Math.max(a.minY, b.minY) + Math.min(a.maxY, b.maxY)) / 2),
    z: round2((Math.max(a.minZ, b.minZ) + Math.min(a.maxZ, b.maxZ)) / 2),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Map an IFC entity family to a coarse construction discipline. */
function disciplineOf(type: string): string {
  if (
    type.startsWith('IFCDUCT') ||
    type === 'IFCFLOWSEGMENT' ||
    type === 'IFCFLOWFITTING' ||
    type === 'IFCFLOWTERMINAL'
  ) {
    return 'mechanical';
  }
  if (type.startsWith('IFCCABLE')) return 'electrical';
  if (type.startsWith('IFCPIPE')) return 'plumbing';
  if (
    type === 'IFCBEAM' ||
    type === 'IFCCOLUMN' ||
    type === 'IFCSLAB' ||
    type === 'IFCMEMBER' ||
    type === 'IFCPLATE'
  ) {
    return 'structural';
  }
  if (type === 'IFCWALL' || type === 'IFCWALLSTANDARDCASE' || type === 'IFCDOOR' || type === 'IFCWINDOW') {
    return 'architectural';
  }
  return 'other';
}
