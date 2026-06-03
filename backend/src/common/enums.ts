/** Canonical enumerations shared across the data model. */

/** How a source file was provided / which parser handles it. */
export enum SourceType {
  P6_XER = 'p6_xer',
  P6_XML = 'p6_xml',
  MSPROJECT_XML = 'msproject_xml',
  EXCEL = 'excel',
  CSV = 'csv',
}

/** Lifecycle of a single ingest → validate → normalise execution. */
export enum IngestionStatus {
  PENDING = 'pending',
  PARSED = 'parsed',
  VALIDATED = 'validated',
  NORMALIZED = 'normalized',
  FAILED = 'failed',
}

/** Canonical resource categories (Primavera-aligned). */
export enum ResourceType {
  LABOR = 'labor',
  NONLABOR = 'nonlabor',
  MATERIAL = 'material',
  EQUIPMENT = 'equipment',
}

/** Reporting cadence for ingested progress reports. */
export enum ReportType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

/** Severity classification for rule-engine alerts (Cycle 2). */
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

/** Lifecycle of one rule-engine evaluation run. */
export enum RuleEvaluationStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
