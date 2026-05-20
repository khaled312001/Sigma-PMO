import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';

import { SourceType } from '../../../common/enums';
import {
  emptyDataset,
  RawDataset,
  RawRecord,
  SourceParser,
} from './parser.interface';

type Bucket = 'projects' | 'activities' | 'resources' | 'reports' | 'assignments';

/**
 * CSV parser. One CSV file maps to one entity type, routed by filename keyword
 * (e.g. `projects.csv`, `activities.csv`, `report_*.csv`). Column headers are
 * expected to use canonical-raw key names (see CANONICAL_RAW_KEYS); each row is
 * kept verbatim under `__raw` for traceability.
 */
@Injectable()
export class CsvParser implements SourceParser {
  readonly name = 'csv';
  readonly sourceType = SourceType.CSV;

  supports(filename: string): boolean {
    return filename.toLowerCase().endsWith('.csv');
  }

  parse(filename: string, buffer: Buffer): RawDataset {
    const dataset = emptyDataset(this.sourceType, this.name);
    const bucket = this.routeByFilename(filename);

    const rows = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as Record<string, unknown>[];

    for (const row of rows) {
      const record: RawRecord = { ...row, __raw: { ...row } };
      dataset[bucket].push(record);
    }

    dataset.meta = { filename, bucket, rowCount: rows.length };
    return dataset;
  }

  private routeByFilename(filename: string): Bucket {
    const name = filename.toLowerCase();
    if (name.includes('project')) return 'projects';
    if (name.includes('assignment')) return 'assignments';
    if (name.includes('resource')) return 'resources';
    if (name.includes('report')) return 'reports';
    return 'activities';
  }
}
