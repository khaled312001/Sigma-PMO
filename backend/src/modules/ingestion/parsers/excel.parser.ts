import { Injectable } from '@nestjs/common';
import { CellValue, Workbook } from 'exceljs';

import { SourceType } from '../../../common/enums';
import {
  emptyDataset,
  RawDataset,
  RawRecord,
  SourceParser,
} from './parser.interface';

type Bucket = 'projects' | 'activities' | 'resources' | 'reports' | 'assignments';

const SHEET_ROUTING: Record<string, Bucket> = {
  projects: 'projects',
  project: 'projects',
  activities: 'activities',
  activity: 'activities',
  tasks: 'activities',
  resources: 'resources',
  resource: 'resources',
  reports: 'reports',
  report: 'reports',
  assignments: 'assignments',
  assignment: 'assignments',
};

/**
 * Excel (.xlsx) parser. Each worksheet maps to one entity type by its name
 * (Projects / Activities / Resources / Reports / Assignments). Row 1 holds the
 * headers (canonical-raw keys); subsequent rows become records.
 */
@Injectable()
export class ExcelParser implements SourceParser {
  readonly name = 'excel';
  readonly sourceType = SourceType.EXCEL;

  supports(filename: string): boolean {
    const name = filename.toLowerCase();
    return name.endsWith('.xlsx') || name.endsWith('.xlsm');
  }

  async parse(filename: string, buffer: Buffer): Promise<RawDataset> {
    const dataset = emptyDataset(this.sourceType, this.name);
    const workbook = new Workbook();
    // exceljs accepts a Node Buffer for the load() reader.
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const sheetNames: string[] = [];
    for (const sheet of workbook.worksheets) {
      sheetNames.push(sheet.name);
      const bucket = SHEET_ROUTING[sheet.name.trim().toLowerCase()];
      if (!bucket) continue;

      const headers: string[] = [];
      sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
        headers[col] = String(cell.value ?? '').trim();
      });

      for (let r = 2; r <= sheet.rowCount; r += 1) {
        const row = sheet.getRow(r);
        if (!row.hasValues) continue;

        const record: RawRecord = { __raw: {} };
        const raw = record.__raw as Record<string, unknown>;
        let hasValue = false;

        for (let c = 1; c < headers.length; c += 1) {
          const key = headers[c];
          if (!key) continue;
          const value = normalizeCell(row.getCell(c).value);
          record[key] = value;
          raw[key] = value;
          if (value !== null && value !== '') hasValue = true;
        }

        if (hasValue) dataset[bucket].push(record);
      }
    }

    dataset.meta = { filename, sheets: sheetNames };
    return dataset;
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
