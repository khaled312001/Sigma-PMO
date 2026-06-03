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
}> = {
  [Role.SIGMA_ADMIN]:    { canRead: true, canIngest: true,  canEvaluateRules: true,  canEditPolicy: true,  canGenerateSummary: true, canReadAll: true  },
  [Role.SIGMA_REVIEWER]: { canRead: true, canIngest: false, canEvaluateRules: true,  canEditPolicy: false, canGenerateSummary: true, canReadAll: true  },
  [Role.CLIENT]:         { canRead: true, canIngest: false, canEvaluateRules: true,  canEditPolicy: true,  canGenerateSummary: true, canReadAll: true  },
  [Role.CONSULTANT]:     { canRead: true, canIngest: true,  canEvaluateRules: true,  canEditPolicy: false, canGenerateSummary: true, canReadAll: true  },
  [Role.CONTRACTOR]:     { canRead: true, canIngest: true,  canEvaluateRules: false, canEditPolicy: false, canGenerateSummary: false, canReadAll: false },
};
