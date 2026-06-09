import { Injectable } from '@nestjs/common';
import { CellValue, Workbook, Worksheet } from 'exceljs';

/**
 * One row out of a Navisworks / Revit Interference Check clash report. Field
 * names are the **canonical** internal shape used by `ClashIngestionService` —
 * the parser owns the column-name fuzzy match (clash reports vary by addin
 * version + by who exported them).
 *
 * Mapping back to `ClashItem` (the persisted entity, post-meeting plan §3.7):
 *
 *  - `clashRef`           → `ClashItem.clashRef`
 *  - `disciplinesInvolved`→ `ClashItem.disciplinesInvolved` (deduped, lowercased)
 *  - `severity`           → `ClashItem.severity` (derived from `status` +
 *                            `distanceMm` per the rules in `deriveSeverity`)
 *  - `description`        → `ClashItem.description` (free-form sentence
 *                            assembled from `element1Name`, `element2Name`,
 *                            `gridLocation`, `distanceMm`, `status`)
 *  - `__raw`              → preserved verbatim on `ClashItem.proposedOptions`
 *                            metadata? No — we keep it under the ingestion
 *                            run summary instead, because `proposedOptions`
 *                            is reserved for the BIM analyst persona's three
 *                            options (the ClashSolutionProposer is a Wave 2
 *                            sibling, not this parser).
 */
export interface ClashRow {
  /** Navisworks "Clash Name" or "Clash ID" — unique within a report. */
  clashRef: string;
  /** Lower-case discipline tokens, deduped. e.g. `['mechanical','electrical']`. */
  disciplinesInvolved: string[];
  /** Original status string from the report, untouched (e.g. `New`, `Active`, `Reviewed`). */
  status: string;
  /** Vertical/lateral overlap in **millimetres**. `null` if the column is empty. */
  distanceMm: number | null;
  /** Grid location text exactly as reported, or `null` if not present. */
  gridLocation: string | null;
  /** Best-effort element name on side 1 (item ID + family + type concatenated). */
  element1Name: string;
  /** Best-effort element name on side 2. */
  element2Name: string;
  /** Untouched key/value dump of the source row, for traceability. */
  __raw: Record<string, unknown>;
}

/**
 * Output of `ClashExcelParser.parse()`. `meta` carries the sheet picked,
 * the header alignment map, and the rejected-row count so the ingestion
 * service can log a single summary line instead of N parser warnings.
 */
export interface ClashDataset {
  rows: ClashRow[];
  meta: {
    sheetName: string;
    headerMap: Record<string, string | null>;
    rejectedRows: number;
    totalRowsScanned: number;
  };
}

/** Header-name fuzzy keys per logical field. Lower-cased, whitespace-stripped. */
const HEADER_ALIASES: Record<keyof Omit<ClashRow, '__raw'> | 'element1Discipline' | 'element2Discipline', string[]> = {
  clashRef: ['clashname', 'clashid', 'name', 'id', 'clash'],
  disciplinesInvolved: [], // synthetic — assembled from element1/2 discipline
  status: ['status', 'state', 'resolution'],
  distanceMm: ['distance', 'distance(mm)', 'distance(m)', 'distance(in)', 'overlap', 'overlap(mm)'],
  gridLocation: ['gridlocation', 'grid', 'location', 'griduvw'],
  element1Name: ['item1', 'element1', 'item1name', 'element1name', 'a', 'itemaname'],
  element2Name: ['item2', 'element2', 'item2name', 'element2name', 'b', 'itembname'],
  element1Discipline: ['item1discipline', 'element1discipline', 'discipline1', 'category1'],
  element2Discipline: ['item2discipline', 'element2discipline', 'discipline2', 'category2'],
};

/** Sheet names we will scan for clash rows. We pick the first match. */
const CANDIDATE_SHEET_NAMES = ['clashes', 'clash report', 'clash detective', 'interference', 'all clashes'];

/**
 * Parses a Navisworks / Revit Interference Check Excel export into a list of
 * `ClashRow`s ready for `ClashIngestionService` to persist.
 *
 * **Why a dedicated parser** (rather than extending the generic
 * `ExcelParser`): the existing `ExcelParser` routes sheets to the canonical
 * planning buckets (Projects / Activities / Resources / …). Clash reports do
 * not fit any of those buckets — they live on `ClashItem`, which is its own
 * Wave-1 entity. Per the post-meeting plan §3.7 + ADR-0012 §5, the clash
 * pipeline is a Layer-1 (Engineering) source that emits its own canonical
 * rows and its own `engineering.clash.ingested` outbox events.
 *
 * **Format notes (Navisworks 2023+ default Excel export):**
 *  - The first ~6 rows are project-info headers (Project, Run name, View,
 *    Tolerance, Created) — they are NOT clash data.
 *  - The header row (`Clash Name | Distance | Description | …`) is detected
 *    by searching for the cell value `Clash Name` (or `Item 1` if that
 *    fails) anywhere in the first 30 rows.
 *  - Subsequent rows are one-clash-per-row; columns vary by Navisworks
 *    version. The fuzzy `HEADER_ALIASES` map keeps the parser resilient.
 *
 * The parser is intentionally lenient: rows with no `clashRef` are skipped
 * (counted under `meta.rejectedRows`) instead of failing the whole file.
 * That mirrors the post-meeting plan §3.7 expectation of "~100 clashes per
 * medium project" — operators must not lose 99 good rows because one row
 * has a malformed name cell.
 */
@Injectable()
export class ClashExcelParser {
  readonly name = 'clash-excel';

  /** Cheap filename check used by callers that want to fail fast. */
  supports(filename: string): boolean {
    const lower = filename.toLowerCase();
    return lower.endsWith('.xlsx') || lower.endsWith('.xlsm');
  }

  async parse(buffer: Buffer): Promise<ClashDataset> {
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const sheet = this.pickSheet(workbook);
    if (!sheet) {
      return {
        rows: [],
        meta: {
          sheetName: '',
          headerMap: {},
          rejectedRows: 0,
          totalRowsScanned: 0,
        },
      };
    }

    const { headerRowIndex, headers } = this.locateHeaders(sheet);
    if (headerRowIndex < 0) {
      return {
        rows: [],
        meta: {
          sheetName: sheet.name,
          headerMap: {},
          rejectedRows: 0,
          totalRowsScanned: 0,
        },
      };
    }

    const headerMap = this.buildHeaderMap(headers);
    const rows: ClashRow[] = [];
    let rejectedRows = 0;
    let totalRowsScanned = 0;

    for (let r = headerRowIndex + 1; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      if (!row.hasValues) continue;
      totalRowsScanned += 1;

      const raw: Record<string, unknown> = {};
      for (let c = 1; c < headers.length; c += 1) {
        const key = headers[c];
        if (!key) continue;
        raw[key] = normalizeCell(row.getCell(c).value);
      }

      const clashRef = this.pickField(raw, headerMap.clashRef);
      if (!clashRef || typeof clashRef !== 'string') {
        rejectedRows += 1;
        continue;
      }

      const status = this.coerceString(this.pickField(raw, headerMap.status)) ?? 'unknown';
      const distanceMm = this.coerceDistanceMm(
        this.pickField(raw, headerMap.distanceMm),
        headers,
        headerMap.distanceMm,
      );
      const gridLocation = this.coerceString(this.pickField(raw, headerMap.gridLocation));
      const element1Name = this.coerceString(this.pickField(raw, headerMap.element1Name)) ?? '';
      const element2Name = this.coerceString(this.pickField(raw, headerMap.element2Name)) ?? '';
      const element1Discipline = this.coerceString(this.pickField(raw, headerMap.element1Discipline));
      const element2Discipline = this.coerceString(this.pickField(raw, headerMap.element2Discipline));

      const disciplinesInvolved = this.collectDisciplines(
        element1Discipline,
        element2Discipline,
        element1Name,
        element2Name,
      );

      rows.push({
        clashRef: clashRef.trim(),
        disciplinesInvolved,
        status,
        distanceMm,
        gridLocation,
        element1Name,
        element2Name,
        __raw: raw,
      });
    }

    return {
      rows,
      meta: {
        sheetName: sheet.name,
        headerMap,
        rejectedRows,
        totalRowsScanned,
      },
    };
  }

  /** Pick the first sheet whose name matches `CANDIDATE_SHEET_NAMES`; else first. */
  private pickSheet(workbook: Workbook): Worksheet | null {
    if (workbook.worksheets.length === 0) return null;
    for (const candidate of CANDIDATE_SHEET_NAMES) {
      const match = workbook.worksheets.find((s) => s.name.trim().toLowerCase() === candidate);
      if (match) return match;
    }
    return workbook.worksheets[0];
  }

  /**
   * Walk the first 30 rows looking for a cell that contains the literal
   * header `Clash Name`, `Item 1`, or `Name` — any of those is a strong
   * signal the next row is the start of clash data. Returns 1-based row
   * index and the populated header values (index 0 unused, like sheet.getRow).
   */
  private locateHeaders(sheet: Worksheet): { headerRowIndex: number; headers: string[] } {
    const maxScan = Math.min(sheet.rowCount, 30);
    const markerTokens = ['clash name', 'item 1', 'item1', 'name'];
    for (let r = 1; r <= maxScan; r += 1) {
      const row = sheet.getRow(r);
      if (!row.hasValues) continue;
      let foundMarker = false;
      row.eachCell({ includeEmpty: false }, (cell) => {
        const text = String(cell.value ?? '').trim().toLowerCase();
        if (markerTokens.includes(text)) foundMarker = true;
      });
      if (foundMarker) {
        const headers: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          headers[col] = String(cell.value ?? '').trim();
        });
        return { headerRowIndex: r, headers };
      }
    }
    return { headerRowIndex: -1, headers: [] };
  }

  /**
   * For every logical field, find the actual header label in the source that
   * best matches one of the aliases. Returns `null` for fields that have no
   * match (the field will be empty on every row).
   */
  private buildHeaderMap(headers: string[]): Record<string, string | null> {
    const normalized = headers.map((h) =>
      h ? h.replace(/\s+/g, '').toLowerCase() : '',
    );
    const out: Record<string, string | null> = {};
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.length === 0) {
        out[key] = null;
        continue;
      }
      let pick: string | null = null;
      for (let i = 1; i < normalized.length; i += 1) {
        if (!normalized[i]) continue;
        for (const alias of aliases) {
          if (normalized[i] === alias || normalized[i].startsWith(alias)) {
            pick = headers[i];
            break;
          }
        }
        if (pick) break;
      }
      out[key] = pick;
    }
    return out;
  }

  /** Pull a value out of the raw record by the resolved header key. */
  private pickField(raw: Record<string, unknown>, key: string | null): unknown {
    if (!key) return null;
    return raw[key] ?? null;
  }

  private coerceString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return String(value);
  }

  /**
   * Convert the distance cell into a number of millimetres. The Navisworks
   * default export ships distance in **metres** in newer versions and
   * **millimetres** in older ones; we sniff the header for `(mm)` / `(m)` /
   * `(in)` and convert. When the unit cannot be guessed we assume metres
   * (the modern default) and document that on `meta.headerMap`.
   */
  private coerceDistanceMm(
    raw: unknown,
    headers: string[],
    headerKey: string | null,
  ): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return null;
    const header = (headerKey ?? '').toLowerCase();
    const headerInline = headers.find((h) => h && h.toLowerCase() === header)?.toLowerCase() ?? header;
    if (headerInline.includes('(mm)') || headerInline.includes('mm')) return Math.abs(n);
    if (headerInline.includes('(in)') || headerInline.includes('inch')) return Math.abs(n) * 25.4;
    // Default: metres → mm
    return Math.abs(n) * 1000;
  }

  /**
   * Discipline detection prefers explicit columns; failing that, it sniffs
   * the element names for industry tokens. The token list mirrors the four
   * disciplines the post-meeting plan §3.7 calls out ("الكهربائي
   * والميكانيكي والمعماري والإنشائي") plus a couple of common siblings
   * (plumbing, fire, hvac) that show up in real exports.
   */
  private collectDisciplines(
    e1Discipline: string | null,
    e2Discipline: string | null,
    e1Name: string,
    e2Name: string,
  ): string[] {
    const out = new Set<string>();
    for (const explicit of [e1Discipline, e2Discipline]) {
      if (explicit) out.add(this.normalizeDiscipline(explicit));
    }
    if (out.size < 2) {
      for (const text of [e1Name, e2Name]) {
        const guessed = this.guessDisciplineFromName(text);
        if (guessed) out.add(guessed);
      }
    }
    return [...out].filter((d) => d.length > 0);
  }

  private normalizeDiscipline(label: string): string {
    const lower = label.trim().toLowerCase();
    if (lower.startsWith('mech')) return 'mechanical';
    if (lower.startsWith('elec')) return 'electrical';
    if (lower.startsWith('struct')) return 'structural';
    if (lower.startsWith('arch')) return 'architectural';
    if (lower.startsWith('plumb')) return 'plumbing';
    if (lower.startsWith('fire')) return 'fire';
    if (lower.startsWith('hvac')) return 'hvac';
    return lower;
  }

  private guessDisciplineFromName(name: string): string | null {
    const lower = name.toLowerCase();
    if (/duct|hvac|fan coil|chiller|vrf|grille/.test(lower)) return 'mechanical';
    if (/cable|conduit|panel|switchgear|lighting|junction|bus duct/.test(lower)) return 'electrical';
    if (/beam|column|slab|footing|rebar|column|steel/.test(lower)) return 'structural';
    if (/wall|door|window|partition|ceiling|cladding/.test(lower)) return 'architectural';
    if (/pipe|valve|sanitary|drain|sewer|water/.test(lower)) return 'plumbing';
    if (/sprinkler|fire hose|fire alarm/.test(lower)) return 'fire';
    return null;
  }
}

/** Reduce an exceljs cell value to a primitive (string | number | Date | null). */
function normalizeCell(value: CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>;
    if ('result' in obj) return obj.result ?? null; // formula
    if ('text' in obj) return obj.text ?? null; // rich text / hyperlink
    if ('richText' in obj && Array.isArray(obj.richText)) {
      return obj.richText.map((part) => (part as { text?: string }).text ?? '').join('');
    }
    return null;
  }
  return value;
}

/**
 * Derive a coarse severity bucket from the report status + overlap distance.
 *
 * Heuristic (deterministic — no AI):
 *  - `critical` if status looks unresolved AND distance >= 50 mm
 *    OR status mentions "hard" (Navisworks "hard clash" terminology)
 *  - `major`    if distance >= 20 mm and status is unresolved
 *    OR status mentions "clearance" (soft clearance violation)
 *  - `minor`    otherwise (distance < 20 mm, or status is reviewed/approved)
 *
 * Exported from the parser file so the ingestion service can call it on the
 * normalised row (kept side-effect-free for tests).
 */
export function deriveSeverity(status: string, distanceMm: number | null): 'critical' | 'major' | 'minor' {
  const s = (status ?? '').toLowerCase();
  const resolved = /reviewed|approved|resolved|closed/.test(s);
  if (resolved) return 'minor';
  if (/hard\s*clash|hard/.test(s)) return 'critical';
  if (distanceMm !== null && distanceMm >= 50) return 'critical';
  if (/clearance|soft/.test(s)) return 'major';
  if (distanceMm !== null && distanceMm >= 20) return 'major';
  return 'minor';
}

/**
 * Assemble the human-readable `description` we persist on `ClashItem`. The
 * shape was picked to match what the `revit.clash.analyst` persona expects
 * in its Output Schema (post-meeting plan §3.3 rule 4): a single sentence
 * naming both elements + grid + distance so the AI has all the spatial
 * context without re-parsing the source.
 */
export function composeDescription(row: ClashRow): string {
  const parts: string[] = [];
  if (row.element1Name && row.element2Name) {
    parts.push(`${row.element1Name} clashes with ${row.element2Name}`);
  } else if (row.element1Name || row.element2Name) {
    parts.push(`Clash involving ${row.element1Name || row.element2Name}`);
  } else {
    parts.push('Clash');
  }
  if (row.gridLocation) parts.push(`at grid ${row.gridLocation}`);
  if (row.distanceMm !== null) parts.push(`overlap ${row.distanceMm.toFixed(1)} mm`);
  if (row.status) parts.push(`(status: ${row.status})`);
  return parts.join(' ');
}
