import { Role } from './api';

/**
 * Frontend mirror of backend ROLE_CAPABILITIES (auth/roles.enum.ts) —
 * post-meeting plan §7 matrix, applied Wave 8. Keep the two files in
 * lockstep; the backend is the enforcement point, this copy only gates UI
 * affordances so users never see a button that will 403.
 */
export const CAPABILITIES: Record<Role, {
  canRead: boolean;
  canIngest: boolean;
  canEvaluateRules: boolean;
  canEditPolicy: boolean;
  canGenerateSummary: boolean;
  canReadAll: boolean;
  /** Mirror of backend ROLE_CAPABILITIES.canSimulate — see ADR-0010 §7. */
  canSimulate: boolean;
  /** Mirror of backend ROLE_CAPABILITIES.canEditPersonas — admin only. */
  canEditPersonas: boolean;
  /** Per-source-type ingestion split (plan §7 / §2.9). */
  canIngestSchedule: boolean;
  canIngestBoQ: boolean;
  canIngestLetter: boolean;
  /** Named approval gates (plan §7). */
  canApproveLetter: boolean;
  canApproveBaseline: boolean;
  canTriggerComputerUse: boolean;
  /** Governance OS (2026-06-11) — hierarchy management + level visibility. */
  canManageHierarchy: boolean;
  canViewEnterprise: boolean;
  canViewPortfolio: boolean;
  canViewProgram: boolean;
  /** Admin-only — control the role-capability matrix at runtime. */
  canManageRoles: boolean;
  /** Investment & Feasibility Intelligence — governance/advisory tier only. */
  canRunFeasibility: boolean;
}> = {
  sigma_admin:    { canRead: true, canIngest: true,  canEvaluateRules: true,  canEditPolicy: true,  canGenerateSummary: true, canReadAll: true,  canSimulate: true,  canEditPersonas: true,  canIngestSchedule: true,  canIngestBoQ: true,  canIngestLetter: true,  canApproveLetter: true,  canApproveBaseline: true,  canTriggerComputerUse: true,  canManageHierarchy: true,  canViewEnterprise: true,  canViewPortfolio: true,  canViewProgram: true, canManageRoles: true, canRunFeasibility: true },
  // Reviewer canSimulate=false — the plan's Khaled-default (read-only
  // charter, open question 13). Flip on Al Ayham's confirmation.
  sigma_reviewer: { canRead: true, canIngest: false, canEvaluateRules: true,  canEditPolicy: false, canGenerateSummary: true, canReadAll: true,  canSimulate: false, canEditPersonas: false, canIngestSchedule: false, canIngestBoQ: false, canIngestLetter: false, canApproveLetter: false, canApproveBaseline: false, canTriggerComputerUse: false, canManageHierarchy: false, canViewEnterprise: true,  canViewPortfolio: true,  canViewProgram: true, canManageRoles: false, canRunFeasibility: true },
  client:         { canRead: true, canIngest: false, canEvaluateRules: true,  canEditPolicy: true,  canGenerateSummary: true, canReadAll: true,  canSimulate: true,  canEditPersonas: false, canIngestSchedule: false, canIngestBoQ: false, canIngestLetter: true,  canApproveLetter: true,  canApproveBaseline: true,  canTriggerComputerUse: false, canManageHierarchy: true,  canViewEnterprise: true,  canViewPortfolio: true,  canViewProgram: true, canManageRoles: false, canRunFeasibility: true },
  // Consultant canIngest=false — plan §7 + Layer-1 role access ("قراءة +
  // اقتراح + محاكاة"); inferred, flagged for Sizing-meeting confirmation.
  consultant:     { canRead: true, canIngest: false, canEvaluateRules: true,  canEditPolicy: false, canGenerateSummary: true, canReadAll: true,  canSimulate: true,  canEditPersonas: false, canIngestSchedule: false, canIngestBoQ: false, canIngestLetter: false, canApproveLetter: false, canApproveBaseline: false, canTriggerComputerUse: false, canManageHierarchy: false, canViewEnterprise: true,  canViewPortfolio: true,  canViewProgram: true, canManageRoles: false, canRunFeasibility: true },
  // Contractor: canEvaluateRules + canGenerateSummary flipped TRUE per
  // plan §7 (his slice); canSimulate from the meeting transcript grant.
  contractor:     { canRead: true, canIngest: true,  canEvaluateRules: true,  canEditPolicy: false, canGenerateSummary: true, canReadAll: false, canSimulate: true,  canEditPersonas: false, canIngestSchedule: true,  canIngestBoQ: true,  canIngestLetter: true,  canApproveLetter: false, canApproveBaseline: false, canTriggerComputerUse: false, canManageHierarchy: false, canViewEnterprise: false, canViewPortfolio: false, canViewProgram: true, canManageRoles: false, canRunFeasibility: false },
  subcontractor:  { canRead: true, canIngest: true,  canEvaluateRules: false, canEditPolicy: false, canGenerateSummary: false, canReadAll: false, canSimulate: true,  canEditPersonas: false, canIngestSchedule: false, canIngestBoQ: false, canIngestLetter: false, canApproveLetter: false, canApproveBaseline: false, canTriggerComputerUse: false, canManageHierarchy: false, canViewEnterprise: false, canViewPortfolio: false, canViewProgram: false, canManageRoles: false, canRunFeasibility: false },
  // Expanded taxonomy (2026-06-12) — mirror of backend defaults; admin retunes live.
  owner:            { canRead: true, canIngest: false, canEvaluateRules: true,  canEditPolicy: true,  canGenerateSummary: true,  canReadAll: true,  canSimulate: true,  canEditPersonas: false, canIngestSchedule: false, canIngestBoQ: false, canIngestLetter: true,  canApproveLetter: true,  canApproveBaseline: true,  canTriggerComputerUse: false, canManageHierarchy: true,  canViewEnterprise: true,  canViewPortfolio: true,  canViewProgram: true,  canManageRoles: false, canRunFeasibility: true  },
  operator:         { canRead: true, canIngest: true,  canEvaluateRules: false, canEditPolicy: false, canGenerateSummary: false, canReadAll: false, canSimulate: false, canEditPersonas: false, canIngestSchedule: false, canIngestBoQ: false, canIngestLetter: false, canApproveLetter: false, canApproveBaseline: false, canTriggerComputerUse: false, canManageHierarchy: false, canViewEnterprise: false, canViewPortfolio: false, canViewProgram: true,  canManageRoles: false, canRunFeasibility: false },
  investor:         { canRead: true, canIngest: false, canEvaluateRules: false, canEditPolicy: false, canGenerateSummary: false, canReadAll: true,  canSimulate: false, canEditPersonas: false, canIngestSchedule: false, canIngestBoQ: false, canIngestLetter: false, canApproveLetter: false, canApproveBaseline: false, canTriggerComputerUse: false, canManageHierarchy: false, canViewEnterprise: true,  canViewPortfolio: true,  canViewProgram: true,  canManageRoles: false, canRunFeasibility: true  },
  lender:           { canRead: true, canIngest: false, canEvaluateRules: false, canEditPolicy: false, canGenerateSummary: false, canReadAll: true,  canSimulate: false, canEditPersonas: false, canIngestSchedule: false, canIngestBoQ: false, canIngestLetter: false, canApproveLetter: false, canApproveBaseline: false, canTriggerComputerUse: false, canManageHierarchy: false, canViewEnterprise: true,  canViewPortfolio: true,  canViewProgram: true,  canManageRoles: false, canRunFeasibility: true  },
  pmo:              { canRead: true, canIngest: true,  canEvaluateRules: true,  canEditPolicy: false, canGenerateSummary: true,  canReadAll: true,  canSimulate: true,  canEditPersonas: false, canIngestSchedule: true,  canIngestBoQ: true,  canIngestLetter: false, canApproveLetter: false, canApproveBaseline: false, canTriggerComputerUse: false, canManageHierarchy: true,  canViewEnterprise: true,  canViewPortfolio: true,  canViewProgram: true,  canManageRoles: false, canRunFeasibility: true  },
  governance_board: { canRead: true, canIngest: false, canEvaluateRules: true,  canEditPolicy: false, canGenerateSummary: true,  canReadAll: true,  canSimulate: false, canEditPersonas: false, canIngestSchedule: false, canIngestBoQ: false, canIngestLetter: false, canApproveLetter: true,  canApproveBaseline: true,  canTriggerComputerUse: false, canManageHierarchy: false, canViewEnterprise: true,  canViewPortfolio: true,  canViewProgram: true,  canManageRoles: false, canRunFeasibility: true  },
};

export const ROLE_LABEL: Record<Role, string> = {
  sigma_admin:      'Sigma Admin',
  sigma_reviewer:   'Sigma Reviewer',
  client:           'Client',
  consultant:       'Consultant',
  contractor:       'Contractor',
  subcontractor:    'Subcontractor',
  owner:            'Owner',
  operator:         'Operator',
  investor:         'Investor',
  lender:           'Lender',
  pmo:              'PMO',
  governance_board: 'Governance Board',
};

/**
 * Apply the EFFECTIVE capability matrix fetched from the backend
 * (`GET /admin/capabilities`) over the hardcoded defaults, in place. The
 * backend merges admin-set overrides with the defaults and is the real
 * enforcement point; this keeps the UI (sidebar + AuthGate) in lockstep so a
 * role whose capability the admin toggled sees its navigation change too.
 * Mutating the singleton means every `CAPABILITIES[role]` reader picks it up.
 */
export function applyCapabilityMatrix(
  matrix: Partial<Record<Role, Partial<(typeof CAPABILITIES)[Role]>>>,
): void {
  for (const role of Object.keys(matrix) as Role[]) {
    const incoming = matrix[role];
    if (CAPABILITIES[role] && incoming) {
      Object.assign(CAPABILITIES[role], incoming);
    }
  }
}
