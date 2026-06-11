/**
 * Stakeholder roles for the unified Layer-3 platform. Aligned with the
 * contract's Annex 1 (Layer 3 Implementation Depth Clarification):
 *   "Contractor, Consultant, Client, and Sigma."
 * Plus internal Sigma admin/reviewer for platform operations.
 */
export enum Role {
  SIGMA_ADMIN = 'sigma_admin',
  SIGMA_REVIEWER = 'sigma_reviewer',
  CLIENT = 'client',
  CONSULTANT = 'consultant',
  CONTRACTOR = 'contractor',
  /**
   * Subcontractor (مقاول الباطن) — Wave 7, correction-plan §2.9, meeting
   * 2026-06-08 @ 00:15:13. Same surface shape as CONTRACTOR but the data
   * slice narrows further: only the activities listed on the user's
   * `activityScope` are visible. Uploads progress reports for its own
   * activities; never sees the project-wide financial position.
   */
  SUBCONTRACTOR = 'subcontractor',
  // ── Expanded role taxonomy (Mr. Ayham, 2026-06-12): Owner, Operator,
  // Investor, Lender, PMO, Governance Board — the platform serves the full
  // capital-project ecosystem, not only delivery-side parties. ──
  /** Asset owner / employer — the decision-authority tier (client-equivalent). */
  OWNER = 'owner',
  /** O&M-phase operator: reads its project slice + uploads operational records. */
  OPERATOR = 'operator',
  /** Equity investor: portfolio-wide read + Investment & Feasibility access. */
  INVESTOR = 'investor',
  /** Lender / financing bank: read-only credit view + feasibility packages. */
  LENDER = 'lender',
  /** PMO office: full operational tier — ingest, evaluate, hierarchy, analytics. */
  PMO = 'pmo',
  /** Governance board: strategic oversight + approval authority, no operations. */
  GOVERNANCE_BOARD = 'governance_board',
}

/**
 * Coarse permissions per role for the four standard role surfaces from the
 * Layer-3 clarification (input / review / approval / evidence). Layer-3
 * detail is "permitted operating view of the same underlying system" — this
 * mapping is the first cut; admin/workflow controls (Cycle 7) extend it.
 */
export const ROLE_CAPABILITIES: Record<Role, {
  canRead: boolean;
  canIngest: boolean;
  canEvaluateRules: boolean;
  canEditPolicy: boolean;
  canGenerateSummary: boolean;
  canReadAll: boolean;
  /**
   * Whether the role may fork a `Scenario` (what-if sandbox). Wave 1 enables
   * this for every role except `contractor` per section 3.4 of the
   * 2026-06-08 post-meeting plan. The Sigma Reviewer / Consultant / Client
   * defaults are deliberately permissive — they only ever write to a
   * Scenario branch, never to canonical truth.
   */
  canSimulate: boolean;
  /**
   * Whether the role may edit the platform's expert personas (append-only,
   * each edit produces a new `PromptVersion`). Personas are platform voice,
   * not per-tenant configuration — only `sigma_admin` qualifies. See
   * ADR-0010 §7. (The post-meeting plan §7 names this `canEditPrompts` —
   * same capability, this is the canonical key.)
   */
  canEditPersonas: boolean;
  /**
   * Per-source-type ingestion split (post-meeting plan §7 / §2.9):
   * the umbrella `canIngest` survives for generic surfaces (clash lists,
   * drawings), while the three named flows gate on their specific flag.
   */
  canIngestSchedule: boolean;
  canIngestBoQ: boolean;
  canIngestLetter: boolean;
  /** Approval gates the plan names explicitly (§7). */
  canApproveLetter: boolean;
  canApproveBaseline: boolean;
  /** Computer Use sessions (Demo Path) — admin-only per plan §7. */
  canTriggerComputerUse: boolean;
  /**
   * Governance OS (2026-06-11): manage the Enterprise → Portfolio → Program →
   * Project hierarchy (create nodes, attach projects, recompute status). The
   * governance owner tier (admin + client). The `canView*` flags gate which
   * upper governance levels a role may see (project-scoped roles see only
   * their project).
   */
  canManageHierarchy: boolean;
  canViewEnterprise: boolean;
  canViewPortfolio: boolean;
  canViewProgram: boolean;
  /**
   * Administer the role-capability matrix itself (toggle any role's
   * capabilities at runtime). Admin-only — the keys-to-the-kingdom flag.
   */
  canManageRoles: boolean;
  /**
   * Investment & Feasibility Intelligence (2026-06-11 follow-up): create
   * opportunities, run Level-1 rapid assessments, generate Level-2 studies
   * and packages, and manage concept-sketch intake. Governance/advisory tier
   * only — pre-project investment data stays hidden from delivery-side roles
   * (contractor/subcontractor).
   */
  canRunFeasibility: boolean;
}> = {
  //
  // Post-meeting plan §7 matrix, applied Wave 8:
  //  - Contractor: canEvaluateRules + canGenerateSummary flipped TRUE
  //    (his slice) per the plan's explicit rows.
  //  - Consultant: canIngest flipped FALSE — plan §7 + Layer-1 role access
  //    ("Consultant: قراءة + اقتراح + محاكاة", no upload). Inferred from
  //    "Consultant مثل Client ناقص تعديل السياسة"; flagged for confirmation
  //    in the Sizing meeting (open question in plan §7 notes).
  //  - Sigma Reviewer: canSimulate FALSE — the plan's Khaled-default
  //    (read-only charter; open question 13). Flip back on Al Ayham's word.
  //  - Contractor/Subcontractor keep canSimulate TRUE (meeting transcript
  //    @ 00:14:14–00:15:25 grants it explicitly; sandbox-only writes).
  //
  [Role.SIGMA_ADMIN]:    { canRead: true, canIngest: true,  canEvaluateRules: true,  canEditPolicy: true,  canGenerateSummary: true, canReadAll: true,  canSimulate: true,  canEditPersonas: true,  canIngestSchedule: true,  canIngestBoQ: true,  canIngestLetter: true,  canApproveLetter: true,  canApproveBaseline: true,  canTriggerComputerUse: true,  canManageHierarchy: true,  canViewEnterprise: true,  canViewPortfolio: true,  canViewProgram: true,  canManageRoles: true, canRunFeasibility: true  },
  [Role.SIGMA_REVIEWER]: { canRead: true, canIngest: false, canEvaluateRules: true,  canEditPolicy: false, canGenerateSummary: true, canReadAll: true,  canSimulate: false, canEditPersonas: false, canIngestSchedule: false, canIngestBoQ: false, canIngestLetter: false, canApproveLetter: false, canApproveBaseline: false, canTriggerComputerUse: false, canManageHierarchy: false, canViewEnterprise: true,  canViewPortfolio: true,  canViewProgram: true,  canManageRoles: false, canRunFeasibility: true },
  [Role.CLIENT]:         { canRead: true, canIngest: false, canEvaluateRules: true,  canEditPolicy: true,  canGenerateSummary: true, canReadAll: true,  canSimulate: true,  canEditPersonas: false, canIngestSchedule: false, canIngestBoQ: false, canIngestLetter: true,  canApproveLetter: true,  canApproveBaseline: true,  canTriggerComputerUse: false, canManageHierarchy: true,  canViewEnterprise: true,  canViewPortfolio: true,  canViewProgram: true,  canManageRoles: false, canRunFeasibility: true },
  [Role.CONSULTANT]:     { canRead: true, canIngest: false, canEvaluateRules: true,  canEditPolicy: false, canGenerateSummary: true, canReadAll: true,  canSimulate: true,  canEditPersonas: false, canIngestSchedule: false, canIngestBoQ: false, canIngestLetter: false, canApproveLetter: false, canApproveBaseline: false, canTriggerComputerUse: false, canManageHierarchy: false, canViewEnterprise: true,  canViewPortfolio: true,  canViewProgram: true,  canManageRoles: false, canRunFeasibility: true },
  [Role.CONTRACTOR]:     { canRead: true, canIngest: true,  canEvaluateRules: true,  canEditPolicy: false, canGenerateSummary: true, canReadAll: false, canSimulate: true,  canEditPersonas: false, canIngestSchedule: true,  canIngestBoQ: true,  canIngestLetter: true,  canApproveLetter: false, canApproveBaseline: false, canTriggerComputerUse: false, canManageHierarchy: false, canViewEnterprise: false, canViewPortfolio: false, canViewProgram: true,  canManageRoles: false, canRunFeasibility: false },
  [Role.SUBCONTRACTOR]:  { canRead: true, canIngest: true,  canEvaluateRules: false, canEditPolicy: false, canGenerateSummary: false, canReadAll: false, canSimulate: true,  canEditPersonas: false, canIngestSchedule: false, canIngestBoQ: false, canIngestLetter: false, canApproveLetter: false, canApproveBaseline: false, canTriggerComputerUse: false, canManageHierarchy: false, canViewEnterprise: false, canViewPortfolio: false, canViewProgram: false, canManageRoles: false, canRunFeasibility: false },
  // Expanded taxonomy (2026-06-12). Defaults; admin can retune live from /admin/roles.
  [Role.OWNER]:            { canRead: true, canIngest: false, canEvaluateRules: true,  canEditPolicy: true,  canGenerateSummary: true,  canReadAll: true,  canSimulate: true,  canEditPersonas: false, canIngestSchedule: false, canIngestBoQ: false, canIngestLetter: true,  canApproveLetter: true,  canApproveBaseline: true,  canTriggerComputerUse: false, canManageHierarchy: true,  canViewEnterprise: true,  canViewPortfolio: true,  canViewProgram: true,  canManageRoles: false, canRunFeasibility: true  },
  [Role.OPERATOR]:         { canRead: true, canIngest: true,  canEvaluateRules: false, canEditPolicy: false, canGenerateSummary: false, canReadAll: false, canSimulate: false, canEditPersonas: false, canIngestSchedule: false, canIngestBoQ: false, canIngestLetter: false, canApproveLetter: false, canApproveBaseline: false, canTriggerComputerUse: false, canManageHierarchy: false, canViewEnterprise: false, canViewPortfolio: false, canViewProgram: true,  canManageRoles: false, canRunFeasibility: false },
  [Role.INVESTOR]:         { canRead: true, canIngest: false, canEvaluateRules: false, canEditPolicy: false, canGenerateSummary: false, canReadAll: true,  canSimulate: false, canEditPersonas: false, canIngestSchedule: false, canIngestBoQ: false, canIngestLetter: false, canApproveLetter: false, canApproveBaseline: false, canTriggerComputerUse: false, canManageHierarchy: false, canViewEnterprise: true,  canViewPortfolio: true,  canViewProgram: true,  canManageRoles: false, canRunFeasibility: true  },
  [Role.LENDER]:           { canRead: true, canIngest: false, canEvaluateRules: false, canEditPolicy: false, canGenerateSummary: false, canReadAll: true,  canSimulate: false, canEditPersonas: false, canIngestSchedule: false, canIngestBoQ: false, canIngestLetter: false, canApproveLetter: false, canApproveBaseline: false, canTriggerComputerUse: false, canManageHierarchy: false, canViewEnterprise: true,  canViewPortfolio: true,  canViewProgram: true,  canManageRoles: false, canRunFeasibility: true  },
  [Role.PMO]:              { canRead: true, canIngest: true,  canEvaluateRules: true,  canEditPolicy: false, canGenerateSummary: true,  canReadAll: true,  canSimulate: true,  canEditPersonas: false, canIngestSchedule: true,  canIngestBoQ: true,  canIngestLetter: false, canApproveLetter: false, canApproveBaseline: false, canTriggerComputerUse: false, canManageHierarchy: true,  canViewEnterprise: true,  canViewPortfolio: true,  canViewProgram: true,  canManageRoles: false, canRunFeasibility: true  },
  [Role.GOVERNANCE_BOARD]: { canRead: true, canIngest: false, canEvaluateRules: true,  canEditPolicy: false, canGenerateSummary: true,  canReadAll: true,  canSimulate: false, canEditPersonas: false, canIngestSchedule: false, canIngestBoQ: false, canIngestLetter: false, canApproveLetter: true,  canApproveBaseline: true,  canTriggerComputerUse: false, canManageHierarchy: false, canViewEnterprise: true,  canViewPortfolio: true,  canViewProgram: true,  canManageRoles: false, canRunFeasibility: true  },
};

/** The full ordered list of capability flag names (derived from admin's row). */
export const CAPABILITY_FLAGS = Object.keys(ROLE_CAPABILITIES[Role.SIGMA_ADMIN]) as Array<
  keyof (typeof ROLE_CAPABILITIES)[Role]
>;
