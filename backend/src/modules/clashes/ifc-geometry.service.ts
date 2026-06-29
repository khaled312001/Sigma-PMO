import { Injectable, Logger } from '@nestjs/common';

/**
 * A 3-D axis-aligned bounding box in model units (millimetres by IFC default).
 */
export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** One geometric element extracted from an IFC model. */
export interface IfcElement {
  /** STEP instance id (e.g. `#404`). */
  ref: string;
  /** IFC GlobalId (the element's persistent GUID). */
  guid: string | null;
  /** IFC entity family, e.g. `IFCFLOWSEGMENT`, `IFCBEAM`. */
  type: string;
  /** Human name (3rd arg), when present. */
  name: string | null;
  /** World placement origin (mm), resolved from the IFCLOCALPLACEMENT chain. */
  world: { x: number; y: number; z: number };
  /** Axis-aligned bounding box in world coordinates. */
  aabb: Aabb;
  /**
   * Confidence of the extent: `bbox` (read from IFCBOUNDINGBOX), `extrusion`
   * (from a swept-solid depth), or `placement` (fallback default box around the
   * placement point — low confidence). Disclosed on every produced clash.
   */
  extentSource: 'bbox' | 'extrusion' | 'placement';
}

/** Output of parsing one IFC model for geometry. */
export interface IfcGeometryModel {
  projectName: string | null;
  elements: IfcElement[];
}

/** A raw parsed STEP instance: type + the inner argument string. */
interface StepInstance {
  ref: string;
  type: string;
  args: string;
}

/** IFC entity families we treat as clashable physical elements. */
const PHYSICAL_TYPES = new Set([
  'IFCWALL',
  'IFCWALLSTANDARDCASE',
  'IFCSLAB',
  'IFCCOLUMN',
  'IFCBEAM',
  'IFCMEMBER',
  'IFCPLATE',
  'IFCFLOWSEGMENT',
  'IFCFLOWFITTING',
  'IFCFLOWTERMINAL',
  'IFCDUCTSEGMENT',
  'IFCPIPESEGMENT',
  'IFCCABLECARRIERSEGMENT',
  'IFCCABLESEGMENT',
  'IFCBUILDINGELEMENTPROXY',
  'IFCDOOR',
  'IFCWINDOW',
]);

/** Default half-extent (mm) of the placement-fallback box when no geometry. */
const DEFAULT_HALF_EXTENT_MM = 150;

/**
 * IfcGeometryService — a deliberately SIMPLIFIED, honest IFC placement/extent
 * extractor (Task 1). It reuses the same hand-rolled STEP scanning approach as
 * `BimModelService` (no geometry kernel, no new dependency) and resolves:
 *
 *  - IFCLOCALPLACEMENT chains (relative placement → parent placement) to a
 *    WORLD translation per element. Rotation is intentionally NOT applied —
 *    this is a translation-only placement resolver, which is correct for the
 *    common axis-aligned case and a documented approximation otherwise.
 *  - An axis-aligned bounding box per element from, in order of preference:
 *      1. an IFCBOUNDINGBOX in the element's shape representation,
 *      2. an extrusion depth (IFCEXTRUDEDAREASOLID) as a vertical extent,
 *      3. a default ±150 mm box around the placement point (flagged
 *         `extentSource: 'placement'`, low confidence).
 *
 * This is NOT Navisworks-grade interference detection — it does not triangulate
 * meshes or do exact solid intersection. It produces defensible AABB overlaps
 * from REAL file geometry (real GUIDs + real placement coordinates), which is
 * what the native clash detect path needs to populate ClashItem rows.
 */
@Injectable()
export class IfcGeometryService {
  private readonly logger = new Logger(IfcGeometryService.name);

  /** Parse an IFC STEP text into elements with world placement + AABB. */
  parse(text: string): IfcGeometryModel {
    const dataStart = text.indexOf('DATA;');
    const body = dataStart >= 0 ? text.slice(dataStart + 5) : text;

    // Build the instance map (id → {type, args}). Records terminate on ';'.
    const byRef = new Map<string, StepInstance>();
    for (const raw of body.split(';')) {
      const inst = raw.trim();
      if (!inst.startsWith('#')) continue;
      const eq = inst.indexOf('=');
      if (eq < 0) continue;
      const ref = inst.slice(0, eq).trim();
      const def = inst.slice(eq + 1).trimStart();
      const m = def.match(/^([A-Z0-9_]+)\s*\((.*)\)\s*$/s);
      if (!m) continue;
      byRef.set(ref, { ref, type: m[1], args: m[2] });
    }

    let projectName: string | null = null;
    const elements: IfcElement[] = [];

    for (const inst of byRef.values()) {
      if (inst.type === 'IFCPROJECT' && projectName === null) {
        projectName = firstQuoted(inst.args);
        continue;
      }
      if (!PHYSICAL_TYPES.has(inst.type)) continue;

      const args = splitTopLevel(inst.args);
      const guid = unquote(args[0]);
      const name = unquote(args[2] ?? null);
      // ObjectPlacement is arg index 5 for rooted building elements
      // (GlobalId, OwnerHistory, Name, Description, ObjectType, ObjectPlacement, …).
      const placementRef = (args[5] ?? '').trim();
      const world = this.resolvePlacement(placementRef, byRef, new Set());
      // Representation is arg index 6 — used to find an IFCBOUNDINGBOX extent.
      const representationRef = (args[6] ?? '').trim();
      const extent = this.resolveExtent(representationRef, byRef);

      const aabb = boxAround(world, extent.half);
      elements.push({
        ref: inst.ref,
        guid,
        type: inst.type,
        name,
        world,
        aabb,
        extentSource: extent.source,
      });
    }

    this.logger.log(
      `IFC geometry: ${elements.length} placed element(s) from ${projectName ?? 'unnamed model'}.`,
    );
    return { projectName, elements };
  }

  /**
   * Resolve an IFCLOCALPLACEMENT reference to a world translation by summing
   * the relative placement origins up the parent chain. Translation-only.
   */
  private resolvePlacement(
    ref: string,
    byRef: Map<string, StepInstance>,
    seen: Set<string>,
  ): { x: number; y: number; z: number } {
    if (!ref || ref === '$' || seen.has(ref)) return { x: 0, y: 0, z: 0 };
    seen.add(ref);
    const inst = byRef.get(ref);
    if (!inst || inst.type !== 'IFCLOCALPLACEMENT') return { x: 0, y: 0, z: 0 };

    // IFCLOCALPLACEMENT(PlacementRelTo, RelativePlacement)
    const [relToRef, relPlacementRef] = splitTopLevel(inst.args).map((s) => s.trim());
    const parent = this.resolvePlacement(relToRef, byRef, seen);
    const local = this.axisOrigin(relPlacementRef, byRef);
    return { x: parent.x + local.x, y: parent.y + local.y, z: parent.z + local.z };
  }

  /** Origin of an IFCAXIS2PLACEMENT3D → its IFCCARTESIANPOINT coordinates. */
  private axisOrigin(
    ref: string,
    byRef: Map<string, StepInstance>,
  ): { x: number; y: number; z: number } {
    const inst = byRef.get((ref ?? '').trim());
    if (!inst || (inst.type !== 'IFCAXIS2PLACEMENT3D' && inst.type !== 'IFCAXIS2PLACEMENT2D')) {
      return { x: 0, y: 0, z: 0 };
    }
    const locationRef = (splitTopLevel(inst.args)[0] ?? '').trim();
    const point = byRef.get(locationRef);
    if (!point || point.type !== 'IFCCARTESIANPOINT') return { x: 0, y: 0, z: 0 };
    const coords = splitTopLevel(stripOuterParens(point.args))
      .map((c) => Number(c.trim()))
      .filter((n) => Number.isFinite(n));
    return { x: coords[0] ?? 0, y: coords[1] ?? 0, z: coords[2] ?? 0 };
  }

  /**
   * Best-effort extent: search the element's representation graph for an
   * IFCBOUNDINGBOX (→ half-extents), else an extrusion depth, else fall back to
   * the default ±150 mm box (low confidence).
   */
  private resolveExtent(
    representationRef: string,
    byRef: Map<string, StepInstance>,
  ): { half: { x: number; y: number; z: number }; source: 'bbox' | 'extrusion' | 'placement' } {
    const refs = this.gatherRefs(representationRef, byRef, new Set(), 0);
    // 1. IFCBOUNDINGBOX(Corner, XDim, YDim, ZDim) → half-extents.
    for (const r of refs) {
      const inst = byRef.get(r);
      if (inst?.type === 'IFCBOUNDINGBOX') {
        const a = splitTopLevel(inst.args);
        const x = Number(a[1]);
        const y = Number(a[2]);
        const z = Number(a[3]);
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          return { half: { x: Math.abs(x) / 2, y: Math.abs(y) / 2, z: Math.abs(z) / 2 }, source: 'bbox' };
        }
      }
    }
    // 2. IFCEXTRUDEDAREASOLID(SweptArea, Position, ExtrudedDirection, Depth).
    for (const r of refs) {
      const inst = byRef.get(r);
      if (inst?.type === 'IFCEXTRUDEDAREASOLID') {
        const depth = Number(splitTopLevel(inst.args)[3]);
        if (Number.isFinite(depth) && depth > 0) {
          return {
            half: { x: DEFAULT_HALF_EXTENT_MM, y: DEFAULT_HALF_EXTENT_MM, z: Math.abs(depth) / 2 },
            source: 'extrusion',
          };
        }
      }
    }
    // 3. Placement fallback.
    return {
      half: { x: DEFAULT_HALF_EXTENT_MM, y: DEFAULT_HALF_EXTENT_MM, z: DEFAULT_HALF_EXTENT_MM },
      source: 'placement',
    };
  }

  /** Collect all instance refs reachable from a representation, depth-capped. */
  private gatherRefs(
    ref: string,
    byRef: Map<string, StepInstance>,
    seen: Set<string>,
    depth: number,
  ): string[] {
    const r = (ref ?? '').trim();
    if (!r || r === '$' || seen.has(r) || depth > 8) return [];
    if (!byRef.has(r)) return [];
    seen.add(r);
    const inst = byRef.get(r)!;
    const out = [r];
    for (const m of inst.args.matchAll(/#\d+/g)) {
      out.push(...this.gatherRefs(m[0], byRef, seen, depth + 1));
    }
    return out;
  }
}

// ───────────────────────── pure helpers ─────────────────────────

/** Build an AABB centred on `world` with the given half-extents. */
function boxAround(
  world: { x: number; y: number; z: number },
  half: { x: number; y: number; z: number },
): Aabb {
  return {
    minX: world.x - half.x,
    minY: world.y - half.y,
    minZ: world.z - half.z,
    maxX: world.x + half.x,
    maxY: world.y + half.y,
    maxZ: world.z + half.z,
  };
}

/** Split a STEP argument list on top-level commas (respecting nested parens + strings). */
function splitTopLevel(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inStr = false;
  let cur = '';
  for (let i = 0; i < args.length; i += 1) {
    const ch = args[i];
    if (inStr) {
      cur += ch;
      if (ch === "'") {
        // Doubled quote escapes inside a STEP string.
        if (args[i + 1] === "'") { cur += args[i + 1]; i += 1; }
        else inStr = false;
      }
      continue;
    }
    if (ch === "'") { inStr = true; cur += ch; continue; }
    if (ch === '(') { depth += 1; cur += ch; continue; }
    if (ch === ')') { depth -= 1; cur += ch; continue; }
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim().length > 0 || out.length > 0) out.push(cur);
  return out;
}

function stripOuterParens(s: string): string {
  const t = s.trim();
  if (t.startsWith('(') && t.endsWith(')')) return t.slice(1, -1);
  return t;
}

function unquote(arg: string | null | undefined): string | null {
  if (!arg) return null;
  const t = arg.trim();
  if (t === '$' || t === '*') return null;
  const m = t.match(/^'((?:[^']|'')*)'$/);
  if (!m) return null;
  const v = m[1].replace(/''/g, "'").trim();
  return v.length > 0 ? v : null;
}

function firstQuoted(args: string): string | null {
  const parts = splitTopLevel(args);
  // arg0 = GlobalId, arg2 = Name for IFCPROJECT.
  return unquote(parts[2] ?? parts[0] ?? null);
}
