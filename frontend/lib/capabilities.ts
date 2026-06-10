import { Role } from './api';

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
}> = {
  sigma_admin:    { canRead: true, canIngest: true,  canEvaluateRules: true,  canEditPolicy: true,  canGenerateSummary: true, canReadAll: true,  canSimulate: true,  canEditPersonas: true  },
  sigma_reviewer: { canRead: true, canIngest: false, canEvaluateRules: true,  canEditPolicy: false, canGenerateSummary: true, canReadAll: true,  canSimulate: true,  canEditPersonas: false },
  client:         { canRead: true, canIngest: false, canEvaluateRules: true,  canEditPolicy: true,  canGenerateSummary: true, canReadAll: true,  canSimulate: true,  canEditPersonas: false },
  consultant:     { canRead: true, canIngest: true,  canEvaluateRules: true,  canEditPolicy: false, canGenerateSummary: true, canReadAll: true,  canSimulate: true,  canEditPersonas: false },
  // canSimulate flipped TRUE in Wave 7 — the 2026-06-08 meeting grants the
  // contractor sandbox simulation (Scenario writes never touch canonical).
  contractor:     { canRead: true, canIngest: true,  canEvaluateRules: false, canEditPolicy: false, canGenerateSummary: false, canReadAll: false, canSimulate: true,  canEditPersonas: false },
  subcontractor:  { canRead: true, canIngest: true,  canEvaluateRules: false, canEditPolicy: false, canGenerateSummary: false, canReadAll: false, canSimulate: true,  canEditPersonas: false },
};

export const ROLE_LABEL: Record<Role, string> = {
  sigma_admin:    'Sigma Admin',
  sigma_reviewer: 'Sigma Reviewer',
  client:         'Client',
  consultant:     'Consultant',
  contractor:     'Contractor',
  subcontractor:  'Subcontractor',
};
