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

export type Role = 'sigma_admin' | 'sigma_reviewer' | 'client' | 'consultant' | 'contractor' | 'subcontractor';

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

/**
 * Persona registry row (ADR-0010). Mirror of `backend/.../persona.entity.ts`
 * — `businessKey` is the stable slug across versions; `(businessKey, version)`
 * is what every Claude call pins itself to for reproducibility.
 */
export type PersonaLayer = 'engineering' | 'planning' | 'governance' | 'reports' | 'simulation';

export interface PersonaRecord {
  id: string;
  businessKey: string;
  version: number;
  isCurrent: boolean;
  title: string;
  layer: PersonaLayer | string;
  description: string;
  systemPrompt: string;
  rules: string[];
  modelTier: string;
  temperature: number;
  ownedByRole: string;
  authoredBy: string | null;
  createdAt: string;
}

/** Patch body accepted by `POST /personas/:slug` — mirrors backend `PersonaPatch`. */
export type PersonaPatch = Partial<
  Pick<
    PersonaRecord,
    | 'title'
    | 'layer'
    | 'description'
    | 'systemPrompt'
    | 'rules'
    | 'modelTier'
    | 'temperature'
    | 'ownedByRole'
    | 'authoredBy'
  >
>;

// ---- Investment & Feasibility Intelligence (2026-06-11 follow-up) --------

export type FeasibilityRecommendation = 'proceed' | 'proceed_with_conditions' | 'hold' | 'reject';

export interface OpportunityRecord {
  id: string;
  createdAt: string;
  code: string;
  title: string;
  projectType: string;
  country: string | null;
  city: string | null;
  estimatedInvestment: string | null;
  currency: string;
  fundingStructure: { equityPct?: number; debtPct?: number; interestRatePct?: number; tenorYears?: number };
  businessObjective: string | null;
  stage: 'idea' | 'assessed' | 'study' | 'approved' | 'rejected' | 'hold' | string;
  inputs: Record<string, unknown>;
  createdBy: string | null;
  /** Stitched by GET /feasibility/opportunities. */
  latestAssessment?: Partial<AssessmentRecord> | null;
}

export interface AssessmentRecord {
  id: string;
  createdAt: string;
  opportunityId: string;
  level: number;
  inputs: Record<string, unknown>;
  assumptions: Record<string, unknown>;
  results: {
    npv: number;
    projectIrr: number | null;
    equityIrr: number | null;
    paybackYears: number | null;
    dscr: { min: number | null; avg: number | null };
    capexBreakdown: Record<string, number>;
    stabilizedRevenue: number;
    stabilizedEbitda: number;
    terminalValue: number;
    debtAmount: number;
    equityAmount: number;
    annualDebtService: number;
    attractivenessScore: number;
    riskScore: number;
    riskFactors: string[];
    conditions: string[];
    hurdleIrrPct: number;
    years: Array<{
      year: number; phase: 'construction' | 'operation';
      revenue: number; opex: number; ebitda: number; capexOutflow: number;
      debtService: number; dscr: number | null;
      projectCashflow: number; equityCashflow: number; cumulativeProjectCashflow: number;
    }>;
  } & Record<string, unknown>;
  riskRating: 'low' | 'moderate' | 'elevated' | 'high' | string;
  recommendation: FeasibilityRecommendation | string;
  governanceStatus: 'green' | 'yellow' | 'orange' | 'red' | string;
  confidence: number;
  narrative: string | null;
  createdBy: string | null;
}

export interface StudySectionRecord {
  id: string;
  createdAt: string;
  opportunityId: string;
  sectionKey: string;
  title: string;
  content: string;
  data: Record<string, unknown> | null;
  version: number;
  isCurrent: boolean;
  status: 'generated' | 'approved' | string;
  source: 'deterministic' | 'llm' | string;
  approvedBy: string | null;
}

export interface ConceptDocumentRecord {
  id: string;
  createdAt: string;
  opportunityId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  extractionStatus: 'pending' | 'extracted' | 'confirmed' | 'failed' | 'manual' | string;
  extraction: { fields?: Record<string, unknown>; confidence?: number; model?: string } | null;
  confirmedFields: Record<string, unknown> | null;
  extractionError: string | null;
  uploadedBy: string | null;
  confirmedBy: string | null;
}

export interface FeasibilityPackage {
  audience: string;
  opportunity: { code: string; title: string; projectType: string; city: string | null; country: string | null; currency: string };
  generatedSections: number;
  approvedSections: number;
  sections: StudySectionRecord[];
}

/**
 * Sandbox Scenario record (ADR-0010 §5). `status` is `'open' | 'committed' |
 * 'discarded'`. The `baselineSnapshot` is empty in Wave 1 — copy-on-write
 * lands in C5 — but the field shape is fixed so the diff viewer can light up
 * as soon as the backend populates it.
 */
export interface ScenarioRecord {
  id: string;
  projectBusinessKey: string;
  name: string;
  authorUserId: string | null;
  authorDisplay: string | null;
  status: 'open' | 'committed' | 'discarded' | string;
  forkedFromAt: string;
  summary: string;
  baselineSnapshot: Record<string, unknown>;
  expiresAt: string | null;
  createdAt: string;
}
