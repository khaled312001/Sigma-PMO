import { Injectable } from '@nestjs/common';
import { CellValue, Workbook, Worksheet } from 'exceljs';

/**
 * One parsed BoQ line, in canonical-raw shape (string-typed decimals so
 * downstream code can hand them straight to TypeORM without losing precision).
 *
 * The parser is intentionally not the place where business validation happens;
 * it normalises shapes and column aliases and leaves rule enforcement (e.g.
 * "amount must equal quantity × unit rate within a tolerance") to the
 * ingestion service.
 */
export interface ParsedBoqLine {
  itemNumber: string;
  description: string;
  unit: string;
  /** Quantity as a string-typed decimal (TypeORM `decimal(18,4)` carrier). */
  quantity: string;
  /** Unit rate as a string-typed decimal (`decimal(18,2)`). */
  unitRate: string;
  /** Amount as a string-typed decimal (`decimal(18,2)`). */
  amount: string;
  /** Optional `Activity.businessKey` link for cross-grounding (Persona rule). */
  activityRef: string | null;
  /** Original parsed row, preserved verbatim so traceability is one column away. */
  rawSource: Record<string, unknown>;
}

/** Output of the BoQ Excel parser — header-level metadata + line array. */
export interface ParsedBoqDocument {
  /** Currency string from a header cell if present, else `null`. */
  currency: string | null;
  /** "Authored by" / preparer name from a header cell if present, else `null`. */
  authoredBy: string | null;
  /** Parsed line items in source order. */
  lines: ParsedBoqLine[];
  /** Per-line non-fatal warnings (bad numbers, amount mismatch beyond tolerance). */
  warnings: string[];
  /** Sheet name we actually consumed. */
  sheetName: string;
}

/**
 * Header aliases accepted for each canonical column. Matching is
 * case-insensitive, whitespace-tolerant, and uses normalised punctuation, so
 * `Item No.`, `ITEM #`, and `item_number` all bind to `itemNumber`.
 *
 * The Arabic aliases match the construction-industry domain terms Al Ayham
 * uses in real BoQs (see vision-lock note 2026-06-04 — "all Arabic text uses
 * construction-industry domain terms, not literal translation").
 */
const HEADER_ALIASES: Record<keyof ParsedBoqLineHeaders, string[]> = {
  itemNumber: [
    'itemnumber',
    'itemno',
    'item',
    'itemcode',
    'sn',
    'srno',
    'sr',
    'no',
    'بندرقم',
    'رقمالبند',
    'البند',
  ],
  description: [
    'description',
    'desc',
    'workdescription',
    'item_description',
    'الوصف',
    'البيان',
  ],
  unit: ['unit', 'uom', 'unitofmeasure', 'الوحدة'],
  quantity: ['quantity', 'qty', 'qnty', 'الكمية', 'كمية'],
  unitRate: [
    'unitrate',
    'rate',
    'price',
    'unitprice',
    'unitcost',
    'سعرالوحدة',
    'فئة',
  ],
  amount: [
    'amount',
    'totalamount',
    'total',
    'lineamount',
    'cost',
    'الإجمالي',
    'الاجمالي',
    'القيمة',
  ],
  activityRef: [
    'activityref',
    'activity',
    'activitycode',
    'wbsref',
    'wbs',
    'activityid',
    'النشاط',
  ],
};

interface ParsedBoqLineHeaders {
  itemNumber: number | null;
  description: number | null;
  unit: number | null;
  quantity: number | null;
  unitRate: number | null;
  amount: number | null;
  activityRef: number | null;
}

const HEADER_METADATA_KEYS = {
  currency: ['currency', 'cur', 'العملة'],
  authoredBy: [
    'authoredby',
    'preparedby',
    'preparer',
    'author',
    'submittedby',
    'بواسطة',
    'إعداد',
    'اعداد',
  ],
};

/** Amount tolerance — `|amount - qty*rate| / max(|amount|, 1) <= 0.01` (1%). */
const AMOUNT_TOLERANCE = 0.01;

/**
 * BoQ Excel parser (post-meeting plan §3.7 + §3.1).
 *
 * Accepts a single-sheet Bill of Quantities document with the standard column
 * set: `ItemNumber, Description, Unit, Quantity, UnitRate, Amount,
 * ActivityRef (optional)`. The parser:
 *
 *  1. Picks the first worksheet whose row 1 binds at least
 *     `{itemNumber, description, unit, quantity, unitRate, amount}` — Excel
 *     files that ship a cover sheet are tolerated.
 *  2. Walks rows 2..N collecting non-empty lines and normalising decimals to
 *     string form (TypeORM driver-friendly).
 *  3. Cross-checks `amount ≈ quantity × unitRate` and records a warning when
 *     the mismatch exceeds 1%. Fatal validation (zero lines, missing required
 *     header, currency mismatch) is the ingestion service's job — the parser
 *     is intentionally permissive so an editor's stray empty rows never block
 *     a real BoQ.
 *
 * Why this parser lives next to the BoQ module rather than under
 * `ingestion/parsers/` (which routes by sheet name into the Project/Activity
 * normaliser): a BoQ does not feed the schedule pipeline — it feeds a separate
 * append-only entity pair (`BoQ` + `BoqItem`), and it carries domain-specific
 * concerns (currency, amount cross-check, activity linking) that have no
 * analogue in the generic schedule importer.
 */
@Injectable()
export class BoqExcelParser {
  readonly name = 'boq-excel';

  /** Cheap check — same filename surface as the generic Excel parser. */
  supports(filename: string): boolean {
    const lower = filename.toLowerCase();
    return lower.endsWith('.xlsx') || lower.endsWith('.xlsm');
  }

  async parse(buffer: Buffer): Promise<ParsedBoqDocument> {
    const workbook = new Workbook();
    // exceljs accepts a Node Buffer for the load() reader.
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const picked = this.pickBoqSheet(workbook);
    if (!picked) {
      throw new Error(
        'No BoQ-shaped sheet found: expected a row of headers with at least Item / Description / Unit / Quantity / Rate / Amount columns.',
      );
    }
    const { sheet, headerRow, headers } = picked;
    const warnings: string[] = [];
    const lines: ParsedBoqLine[] = [];

    for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      if (!row.hasValues) continue;

      const itemNumber = readString(row.getCell(headers.itemNumber!).value);
      const description = readString(row.getCell(headers.description!).value);
      const unit = readString(row.getCell(headers.unit!).value);
      const quantityRaw = row.getCell(headers.quantity!).value;
      const unitRateRaw = row.getCell(headers.unitRate!).value;
      const amountRaw = row.getCell(headers.amount!).value;
      const activityRefRaw =
        headers.activityRef !== null
          ? row.getCell(headers.activityRef).value
          : null;

      // Sub-total / blank / "Total" rows: skip silently. A BoQ commonly carries
      // a final "Grand Total" row with only an amount populated.
      const isFullyEmpty =
        !itemNumber &&
        !description &&
        quantityRaw === null &&
        unitRateRaw === null &&
        amountRaw === null;
      if (isFullyEmpty) continue;

      // A real line needs at least an item number + description + a number on
      // the quantity OR amount column. Anything else is a subtotal/heading.
      const hasNumericBody = !isBlank(quantityRaw) || !isBlank(amountRaw);
      if (!itemNumber || !description || !hasNumericBody) continue;

      const quantity = readDecimal(quantityRaw);
      const unitRate = readDecimal(unitRateRaw);
      const amount = readDecimal(amountRaw);

      if (quantity === null || unitRate === null || amount === null) {
        warnings.push(
          `Row ${r} (${itemNumber}): one of quantity/unitRate/amount is not a number; line skipped.`,
        );
        continue;
      }

      // amount ≈ qty * rate within tolerance.
      const expected = Number(quantity) * Number(unitRate);
      const denominator = Math.max(Math.abs(Number(amount)), 1);
      const rel = Math.abs(Number(amount) - expected) / denominator;
      if (Number.isFinite(rel) && rel > AMOUNT_TOLERANCE) {
        warnings.push(
          `Row ${r} (${itemNumber}): amount ${amount} differs from quantity*rate=${expected.toFixed(2)} by ${(rel * 100).toFixed(2)}%.`,
        );
      }

      lines.push({
        itemNumber,
        description,
        unit: unit || 'unit',
        quantity: toDecimalString(quantity, 4),
        unitRate: toDecimalString(unitRate, 2),
        amount: toDecimalString(amount, 2),
        activityRef: readString(activityRefRaw ?? null) || null,
        rawSource: {
          row: r,
          itemNumber,
          description,
          unit,
          quantity: quantityRaw,
          unitRate: unitRateRaw,
          amount: amountRaw,
          activityRef: activityRefRaw,
        },
      });
    }

    return {
      currency: this.readHeaderMetadata(sheet, HEADER_METADATA_KEYS.currency),
      authoredBy: this.readHeaderMetadata(
        sheet,
        HEADER_METADATA_KEYS.authoredBy,
      ),
      lines,
      warnings,
      sheetName: sheet.name,
    };
  }

  /**
   * Walk every worksheet looking for one whose first non-empty row carries
   * enough headers to be a BoQ. Returns the first match so a cover sheet
   * placed before the BoQ does not break ingestion.
   */
  private pickBoqSheet(workbook: Workbook): {
    sheet: Worksheet;
    headerRow: number;
    headers: ParsedBoqLineHeaders;
  } | null {
    for (const sheet of workbook.worksheets) {
      // Search the first 10 rows for a header band — real-world BoQs often
      // carry a 2-3 row title block before the columns start.
      const searchLimit = Math.min(sheet.rowCount, 10);
      for (let r = 1; r <= searchLimit; r += 1) {
        const candidate = this.tryHeaderRow(sheet, r);
        if (candidate) {
          return { sheet, headerRow: r, headers: candidate };
        }
      }
    }
    return null;
  }

  /** Build a column → field map from a candidate header row; null if it isn't a BoQ. */
  private tryHeaderRow(
    sheet: Worksheet,
    rowIndex: number,
  ): ParsedBoqLineHeaders | null {
    const headers: ParsedBoqLineHeaders = {
      itemNumber: null,
      description: null,
      unit: null,
      quantity: null,
      unitRate: null,
      amount: null,
      activityRef: null,
    };
    const row = sheet.getRow(rowIndex);
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const norm = normaliseHeader(readString(cell.value));
      if (!norm) return;
      for (const [key, aliases] of Object.entries(HEADER_ALIASES) as [
        keyof ParsedBoqLineHeaders,
        string[],
      ][]) {
        if (headers[key] !== null) continue;
        if (aliases.includes(norm)) {
          headers[key] = col;
          return;
        }
      }
    });
    const required: (keyof ParsedBoqLineHeaders)[] = [
      'itemNumber',
      'description',
      'unit',
      'quantity',
      'unitRate',
      'amount',
    ];
    for (const k of required) {
      if (headers[k] === null) return null;
    }
    return headers;
  }

  /**
   * Look for `Currency: AED` / `Prepared by: X` style metadata in the first
   * few rows. Returns the first non-empty cell that follows a label match.
   * Returns `null` when nothing matched — the BoQ entity carries sensible
   * defaults (currency = 'AED', authoredBy nullable).
   */
  private readHeaderMetadata(
    sheet: Worksheet,
    aliases: string[],
  ): string | null {
    const limit = Math.min(sheet.rowCount, 10);
    for (let r = 1; r <= limit; r += 1) {
      const row = sheet.getRow(r);
      let hit: string | null = null;
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        if (hit) return;
        const norm = normaliseHeader(readString(cell.value));
        if (!norm) return;
        // Tolerate "Currency:" by trimming a trailing colon before alias match.
        const stripped = norm.replace(/[:：]+$/, '');
        if (aliases.includes(stripped)) {
          // Value in the next cell to the right; if blank, peek the cell below.
          const nextRight = readString(row.getCell(col + 1).value);
          if (nextRight) {
            hit = nextRight;
            return;
          }
          const nextDown = readString(sheet.getRow(r + 1).getCell(col).value);
          if (nextDown) hit = nextDown;
        }
      });
      if (hit) return hit;
    }
    return null;
  }
}

/* ------------------------- cell-level helpers ---------------------------- */

function isBlank(value: CellValue): boolean {
  return value === null || value === undefined || value === '';
}

function readString(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    // ExcelJS union (CellErrorValue | CellRichTextValue | CellHyperlinkValue |
    // CellFormulaValue | CellSharedFormulaValue) doesn't sufficiently overlap
    // with Record<string, unknown> for a direct cast — go via unknown so we
    // can probe the shape safely.
    const obj = value as unknown as Record<string, unknown>;
    if (typeof obj.result === 'string') return obj.result.trim();
    if (typeof obj.result === 'number') return String(obj.result);
    if (typeof obj.text === 'string') return obj.text.trim();
    if (Array.isArray(obj.richText)) {
      return obj.richText
        .map((p) => (p as { text?: string }).text ?? '')
        .join('')
        .trim();
    }
    // Unknown object shape — return empty rather than risk "[object Object]".
    return '';
  }
  // Fallback for any future primitive — safe coercion via Number/String paths
  // already covered, so this branch only catches `symbol` / `bigint`.
  return '';
}

function readDecimal(value: CellValue): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    // Tolerate "1,234.50" / " 12.5 " — common in human-edited BoQs.
    const stripped = value.replace(/[\s,]/g, '');
    if (!stripped) return null;
    const n = Number(stripped);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>;
    if (typeof obj.result === 'number' && Number.isFinite(obj.result))
      return obj.result;
    if (typeof obj.result === 'string') return readDecimal(obj.result);
  }
  return null;
}

function toDecimalString(value: number, scale: number): string {
  // `Number.toFixed` is good enough for the precision band we accept on input
  // (Excel doubles can't represent more than 15 significant digits anyway).
  return value.toFixed(scale);
}

function normaliseHeader(raw: string): string {
  // Strip every whitespace flavour Excel can produce — regular space,
  // NBSP (U+00A0), narrow NBSP (U+202F), zero-width space (U+200B) —
  // plus the noise characters that bracket BoQ header words
  // (`_`, `-`, `.`, `/`, `#`). Unicode escapes are used instead of
  // literals so ESLint's `no-irregular-whitespace` rule does not trip.
  return raw.replace(/[\s\u00a0\u202f\u200b_\-./#]+/g, '').toLowerCase();
}
