import { Role } from './api';

export const CAPABILITIES: Record<Role, {
  canRead: boolean;
  canIngest: boolean;
  canEvaluateRules: boolean;
  canEditPolicy: boolean;
  canGenerateSummary: boolean;
  canReadAll: boolean;
}> = {
  sigma_admin:    { canRead: true, canIngest: true,  canEvaluateRules: true,  canEditPolicy: true,  canGenerateSummary: true, canReadAll: true },
  sigma_reviewer: { canRead: true, canIngest: false, canEvaluateRules: true,  canEditPolicy: false, canGenerateSummary: true, canReadAll: true },
  client:         { canRead: true, canIngest: false, canEvaluateRules: true,  canEditPolicy: true,  canGenerateSummary: true, canReadAll: true },
  consultant:     { canRead: true, canIngest: true,  canEvaluateRules: true,  canEditPolicy: false, canGenerateSummary: true, canReadAll: true },
  contractor:     { canRead: true, canIngest: true,  canEvaluateRules: false, canEditPolicy: false, canGenerateSummary: false, canReadAll: false },
};

export const ROLE_LABEL: Record<Role, string> = {
  sigma_admin:    'Sigma Admin',
  sigma_reviewer: 'Sigma Reviewer',
  client:         'Client',
  consultant:     'Consultant',
  contractor:     'Contractor',
};
