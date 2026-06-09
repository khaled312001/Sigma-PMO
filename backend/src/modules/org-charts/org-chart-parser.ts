import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

/** One row from the contractor's submitted org-chart workbook. */
export interface OrgChartRow {
  role: string;
  holder: string | null;
  reportsTo: string | null;
  discipline: string | null;
  notes: string | null;
}

const ROLE_HEADERS = ['role', 'position', 'title'];
const HOLDER_HEADERS = ['holder', 'name', 'incumbent', 'assignee'];
const REPORTS_TO_HEADERS = ['reportsto', 'reports_to', 'reports to', 'reportingline', 'reporting_line', 'reporting to', 'manager'];
const DISCIPLINE_HEADERS = ['discipline', 'department', 'function', 'team'];
const NOTES_HEADERS = ['notes', 'comments', 'remarks', 'note'];

/** Strip whitespace + lowercase for header matching. */
function norm(s: string | undefined | null): string {
  return (s ?? '').toString().trim().toLowerCase();
}

/** Pick the column index for the first header in `candidates` that's present. */
function pickColumn(headers: string[], candidates: string[]): number | null {
  for (const candidate of candidates) {
    const idx = headers.findIndex((h) => h === candidate);
    if (idx !== -1) return idx;
  }
  return null;
}

/**
 * Parse an Excel buffer holding a contractor org-chart. Expects a single sheet
 * (or uses the first sheet) with headers in row 1: at minimum a "Role" or
 * "Position" or "Title" column. Other columns (Holder, ReportsTo, Discipline,
 * Notes) are optional but encouraged.
 *
 * Throws `BadRequestException` for missing minimum headers; tolerates blank
 * rows and trims whitespace everywhere.
 */
export function parseOrgChartExcel(buffer: Buffer): OrgChartRow[] {
  // Synchronous-look API; ExcelJS workbook load returns a promise but we want
  // the parser pure so callers can await it. Exposed via a sister async
  // helper below.
  throw new Error('Call parseOrgChartExcelAsync — exceljs workbook load is async.');
  void buffer;
}

/** Async parser variant (real entry point). */
export async function parseOrgChartExcelAsync(buffer: Buffer): Promise<OrgChartRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
  } catch (e) {
    throw new BadRequestException(`Failed to parse org-chart Excel: ${(e as Error).message}`);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new BadRequestException('Org-chart workbook contains no worksheets.');
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = norm(cell.value as string);
  });

  const roleCol = pickColumn(headers, ROLE_HEADERS);
  if (roleCol === null) {
    throw new BadRequestException(
      `Org-chart workbook must have a "Role" / "Position" / "Title" column. Got headers: ${headers.join(', ')}`,
    );
  }
  const holderCol = pickColumn(headers, HOLDER_HEADERS);
  const reportsToCol = pickColumn(headers, REPORTS_TO_HEADERS);
  const disciplineCol = pickColumn(headers, DISCIPLINE_HEADERS);
  const notesCol = pickColumn(headers, NOTES_HEADERS);

  const rows: OrgChartRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cell = (i: number | null): string | null => {
      if (i === null) return null;
      const v = row.getCell(i + 1).value;
      if (v === null || v === undefined) return null;
      const text = String(v).trim();
      return text.length === 0 ? null : text;
    };

    const role = cell(roleCol);
    if (!role) continue; // blank row

    rows.push({
      role,
      holder: cell(holderCol),
      reportsTo: cell(reportsToCol),
      discipline: cell(disciplineCol),
      notes: cell(notesCol),
    });
  }

  if (rows.length === 0) {
    throw new BadRequestException('Org-chart workbook contains no role rows after the header.');
  }

  return rows;
}
