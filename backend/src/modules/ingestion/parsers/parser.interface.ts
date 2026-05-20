import { SourceType } from '../../../common/enums';

/**
 * A single parsed record as a flat key/value bag. Parsers translate their
 * source-specific fields into the *canonical-raw* key names the Normalizer
 * expects (see CANONICAL_RAW_KEYS below), while preserving the untouched
 * original row under `__raw` for full traceability.
 */
export type RawRecord = Record<string, unknown> & { __raw?: Record<string, unknown> };

/**
 * The uniform output of every parser: source records grouped by canonical
 * entity type. The Normalizer consumes this shape regardless of source format,
 * which keeps source-specific logic isolated inside parsers (modular design).
 */
export interface RawDataset {
  sourceType: SourceType;
  parser: string;
  projects: RawRecord[];
  activities: RawRecord[];
  resources: RawRecord[];
  reports: RawRecord[];
  assignments: RawRecord[];
  /** Parser-level notes, warnings, and counts. */
  meta: Record<string, unknown>;
}

/** Contract implemented by every source parser (CSV, Excel, P6 XER, P6 XML). */
export interface SourceParser {
  readonly name: string;
  readonly sourceType: SourceType;
  /** Cheap check of whether this parser handles the given file. */
  supports(filename: string, buffer: Buffer): boolean;
  /** Parse the file bytes into the uniform RawDataset shape. */
  parse(filename: string, buffer: Buffer): Promise<RawDataset> | RawDataset;
}

/** Returns an empty RawDataset for a given source/parser. */
export function emptyDataset(sourceType: SourceType, parser: string): RawDataset {
  return {
    sourceType,
    parser,
    projects: [],
    activities: [],
    resources: [],
    reports: [],
    assignments: [],
    meta: {},
  };
}

/**
 * Canonical-raw key names parsers should emit per entity type. Documented here
 * as the contract between parsers and the Normalizer.
 */
export const CANONICAL_RAW_KEYS = {
  project: [
    'businessKey',
    'name',
    'status',
    'clientName',
    'currency',
    'dataDate',
    'plannedStart',
    'plannedFinish',
    'actualStart',
    'actualFinish',
    'budgetAtCompletion',
  ],
  activity: [
    'businessKey',
    'projectKey',
    'wbsCode',
    'name',
    'activityType',
    'status',
    'plannedStart',
    'plannedFinish',
    'actualStart',
    'actualFinish',
    'plannedDurationDays',
    'remainingDurationDays',
    'plannedPctComplete',
    'actualPctComplete',
    'budgetedCost',
    'actualCost',
  ],
  resource: [
    'businessKey',
    'projectKey',
    'name',
    'resourceType',
    'unitOfMeasure',
    'maxUnitsPerDay',
    'standardRate',
  ],
  report: [
    'businessKey',
    'projectKey',
    'reportType',
    'reportDate',
    'periodStart',
    'periodEnd',
    'submittedBy',
    'reportedPctComplete',
    'narrative',
    'metrics',
  ],
  assignment: [
    'businessKey',
    'activityKey',
    'resourceKey',
    'plannedUnits',
    'actualUnits',
    'plannedCost',
    'actualCost',
  ],
} as const;
