import { Role } from './api';

export const CAPABILITIES: Record<Role, {
  canIngest: boolean;
  canEvaluateRules: boolean;
  canEditPolicy: boolean;
  canGenerateSummary: boolean;
  canReadAll: boolean;
}> = {
  sigma_admin:    { canIngest: true,  canEvaluateRules: true,  canEditPolicy: true,  canGenerateSummary: true, canReadAll: true },
  sigma_reviewer: { canIngest: false, canEvaluateRules: true,  canEditPolicy: false, canGenerateSummary: true, canReadAll: true },
  client:         { canIngest: false, canEvaluateRules: true,  canEditPolicy: true,  canGenerateSummary: true, canReadAll: true },
  consultant:     { canIngest: true,  canEvaluateRules: true,  canEditPolicy: false, canGenerateSummary: true, canReadAll: true },
  contractor:     { canIngest: true,  canEvaluateRules: false, canEditPolicy: false, canGenerateSummary: false, canReadAll: false },
};

export const ROLE_LABEL: Record<Role, string> = {
  sigma_admin:    'Sigma Admin',
  sigma_reviewer: 'Sigma Reviewer',
  client:         'Client',
  consultant:     'Consultant',
  contractor:     'Contractor',
};
