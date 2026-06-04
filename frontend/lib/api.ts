/** Base URL of the Sigma PMO backend API. */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

const KEY_STORAGE = 'sigma_api_key';

export function getApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(KEY_STORAGE);
}

export function setApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY_STORAGE, key);
}

export function clearApiKey(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY_STORAGE);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const key = getApiKey();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(key ? { 'x-api-key': key } : {}),
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    cache: 'no-store',
    ...init,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${path} → ${response.status}: ${text.slice(0, 240)}`);
  }
  return (await response.json()) as T;
}

// ---- Shared types --------------------------------------------------------

export type Role = 'sigma_admin' | 'sigma_reviewer' | 'client' | 'consultant' | 'contractor';

export interface MeResponse {
  authenticated: boolean;
  bootstrapMode: boolean;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: Role;
    projectScopes: string;
    emiratesId: string | null;
  } | null;
}

export interface LoginResponse {
  apiKey: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: Role;
    projectScopes: string;
    emiratesId: string | null;
  };
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
  /** Versioned id — pins to the project row that was current when the alert fired. */
  projectId: string;
  /**
   * Stable cross-version key. Use this (NOT projectId) when grouping alerts
   * by project — alert.projectId pins to a specific version and undercounts
   * after a new ingestion run rolls the project forward.
   */
  projectBusinessKey: string | null;
  activityId: string | null;
  ingestionRunId: string;
  sourceFileId: string;
  ruleEvaluationId: string;
  context: Record<string, unknown>;
  createdAt: string;
}

export interface GovernanceDecision {
  id: string;
  alertId: string;
  policyId: string;
  policyVersion: number;
  responsibleParty: string;
  fidicClause: string | null;
  fidicNotice: string | null;
  fidicDeadlineDays: number | null;
  escalationLevel: string;
  notifyParties: string[];
  interventions: string[];
  rationale: string;
  createdAt: string;
}

export interface DecisionReview {
  id: string;
  decisionId: string;
  alertId: string;
  action: string;
  performedByDisplay: string | null;
  comment: string | null;
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

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  projectScopes: string;
  active: boolean;
  createdAt: string;
}

export interface GovernancePolicyRecord {
  id: string;
  projectKey: string | null;
  version: number;
  isCurrent: boolean;
  authoredBy: string | null;
  config: Record<string, unknown>;
  createdAt: string;
}
