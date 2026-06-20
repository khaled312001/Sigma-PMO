/**
 * FIDIC starter clause-rule presets (Mr. Ayham acceptance #2). Seed a project's
 * Contract Rules register with the key time/authority rules of a standard form so
 * facts can immediately be tested against the contract. Indicative defaults —
 * always reconcile with the executed contract's Particular Conditions.
 */
export interface PresetRule {
  clauseRef: string;
  title: string;
  ruleType: 'notice' | 'time_bar' | 'response_period' | 'deemed_approval' | 'particulars' | 'determination' | 'instruction_authority';
  triggerEvent: string;
  daysToAct: number | null;
  actor: string;
  consequence: string;
  deemedOutcome?: string;
  basis: string;
}

export interface ContractPreset {
  standard: string;
  rules: PresetRule[];
}

export const CONTRACT_PRESETS: Record<string, ContractPreset> = {
  'fidic-red-1999': {
    standard: 'FIDIC Red Book 1999',
    rules: [
      {
        clauseRef: '20.1', title: 'Notice of Claim (28 days)', ruleType: 'time_bar',
        triggerEvent: 'The Contractor became aware, or should have become aware, of the event or circumstance giving rise to the claim.',
        daysToAct: 28, actor: 'contractor',
        consequence: 'If notice is not given within 28 days, the Time for Completion shall not be extended, the Contractor shall not be entitled to additional payment, and the Employer is discharged from liability (condition precedent / time bar).',
        basis: 'FIDIC Red Book 1999 Sub-Clause 20.1, paragraph 2.',
      },
      {
        clauseRef: '20.1', title: 'Fully detailed claim / particulars (42 days)', ruleType: 'particulars',
        triggerEvent: 'The Contractor became aware of the event or circumstance giving rise to the claim.',
        daysToAct: 42, actor: 'contractor',
        consequence: 'The fully detailed claim with supporting particulars should be sent within 42 days; otherwise the claim may be assessed on the particulars available.',
        basis: 'FIDIC Red Book 1999 Sub-Clause 20.1, paragraph 5.',
      },
      {
        clauseRef: '8.4', title: 'Extension of Time entitlement', ruleType: 'notice',
        triggerEvent: 'A cause of delay listed in 8.4 (variation, employer risk, exceptional event) impacts completion.',
        daysToAct: null, actor: 'contractor',
        consequence: 'Entitlement to EOT exists where a 8.4 cause delays completion, subject to the 20.1 notice.',
        basis: 'FIDIC Red Book 1999 Sub-Clause 8.4.',
      },
      {
        clauseRef: '3.5', title: "Engineer's determination", ruleType: 'determination',
        triggerEvent: 'A matter is referred to the Engineer for agreement or determination.',
        daysToAct: null, actor: 'engineer',
        consequence: 'The Engineer shall consult and make a fair determination; no fixed day limit in the 1999 form (reconcile with Particular Conditions).',
        basis: 'FIDIC Red Book 1999 Sub-Clause 3.5.',
      },
      {
        clauseRef: '2.5', title: "Employer's Claims notice", ruleType: 'notice',
        triggerEvent: 'The Employer becomes aware of an event giving rise to a claim against the Contractor.',
        daysToAct: null, actor: 'employer',
        consequence: 'The Employer shall give notice as soon as practicable; late notice weakens the employer claim.',
        basis: 'FIDIC Red Book 1999 Sub-Clause 2.5.',
      },
    ],
  },
  'fidic-2017': {
    standard: 'FIDIC 2017 (Red/Yellow)',
    rules: [
      {
        clauseRef: '20.2.1', title: 'Notice of Claim (28 days)', ruleType: 'time_bar',
        triggerEvent: 'The claiming Party became aware, or should have become aware, of the event or circumstance.',
        daysToAct: 28, actor: 'either',
        consequence: 'If the Notice of Claim is not given within 28 days, the claiming Party loses entitlement and the other Party is discharged (time bar, subject to 20.2.5).',
        basis: 'FIDIC 2017 Sub-Clause 20.2.1.',
      },
      {
        clauseRef: '20.2.4', title: 'Fully detailed Claim (84 days)', ruleType: 'particulars',
        triggerEvent: 'The claiming Party became aware of the event or circumstance.',
        daysToAct: 84, actor: 'either',
        consequence: 'The fully detailed Claim (with contractual/legal basis and full supporting particulars) is due within 84 days; failure may cause the Notice to lapse for the relevant matter.',
        basis: 'FIDIC 2017 Sub-Clause 20.2.4.',
      },
      {
        clauseRef: '3.7.3', title: "Engineer's determination (42 days)", ruleType: 'determination',
        triggerEvent: 'The matter is referred for the Engineer to determine (after the time limit for agreement).',
        daysToAct: 42, actor: 'engineer',
        consequence: 'The Engineer must make a fair determination within 42 days; otherwise it is deemed a rejection that may be referred to the DAAB.',
        deemedOutcome: 'rejected',
        basis: 'FIDIC 2017 Sub-Clause 3.7.3.',
      },
      {
        clauseRef: '8.5', title: 'Extension of Time', ruleType: 'notice',
        triggerEvent: 'A cause of delay under 8.5 affects completion.',
        daysToAct: null, actor: 'contractor',
        consequence: 'Entitlement to EOT where a 8.5 cause delays completion, subject to the 20.2 Notice of Claim.',
        basis: 'FIDIC 2017 Sub-Clause 8.5.',
      },
    ],
  },
};

export const PRESET_KEYS = Object.keys(CONTRACT_PRESETS);
