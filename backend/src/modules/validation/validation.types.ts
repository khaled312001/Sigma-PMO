export type Severity = 'error' | 'warning';

/** A single validation finding against one record/field. */
export interface ValidationIssue {
  severity: Severity;
  entity: string;
  businessKey: string | null;
  field: string | null;
  code: string;
  message: string;
}

/** Aggregate validation outcome for one ingested dataset. */
export interface ValidationReport {
  /** False if any error-severity issue is present. */
  passed: boolean;
  errorCount: number;
  warningCount: number;
  issues: ValidationIssue[];
}
