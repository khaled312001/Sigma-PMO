/** Base URL of the Sigma PMO backend API. */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
    ...init,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${path} → ${response.status}: ${text.slice(0, 240)}`);
  }
  return (await response.json()) as T;
}

export interface IngestionRun {
  id: string;
  createdAt: string;
  parser: string;
  status: string;
  validationPassed: boolean | null;
  rowCounts: Record<string, number>;
  summary: { confidence?: { overall: number } } & Record<string, unknown>;
}

export interface AlertRecord {
  id: string;
  code: string;
  severity: 'info' | 'warning' | 'critical';
  summary: string;
  projectId: string;
  activityId: string | null;
  ingestionRunId: string;
  sourceFileId: string;
  ruleEvaluationId: string;
  context: Record<string, unknown>;
  createdAt: string;
}

export interface ExecutiveSummary {
  id: string;
  createdAt: string;
  projectId: string;
  periodStart: string;
  periodEnd: string;
  narrative: string;
  groundedNarrative: string;
  source: 'deterministic' | 'llm';
  llmProvider: string | null;
  llmModel: string | null;
  confidenceAverage: number;
  metrics: Record<string, unknown>;
}

export interface EvidencePackage {
  alert: AlertRecord;
  rationale: string;
  project: { name: string; rawSource?: Record<string, unknown> } | null;
  activity: { name: string; rawSource?: Record<string, unknown> } | null;
  sourceFile: { filename: string; contentSha256: string; storedPath: string } | null;
  confidence: { overall: number; completeness: number; consistency: number; sourceReliability: number } | null;
  rawSourceSnippets: Record<string, unknown>;
}
