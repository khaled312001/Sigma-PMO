/**
 * FIDIC Red Book correspondence template catalog (Layer 3 — letter templates).
 *
 * Eight standard governance letters a PMO issues against a FIDIC 1999/2017 Red
 * Book contract. Each entry is a STATIC scaffold: the governing Sub-Clause, a
 * category (so the correspondence library can group), and a `bodySkeleton` the
 * drafter prefills before the persona (or a human) fleshes out the prose.
 *
 * The skeletons use `{{placeholders}}` for the reviewer to fill — they are not
 * sent verbatim; they prime the draft form so a user starts from a contractual
 * shape instead of a blank page. The `LetterDrafterService` reads a template by
 * key to seed `subject` + `fidicClauseRef` + the body draft.
 *
 * These templates carry NO legal force on their own — they are starting points
 * the Engineer/PMO adapts. Deterministic + static; no LLM here.
 */

export type LetterCategory = 'notice' | 'claim' | 'response' | 'instruction';

export interface LetterTemplate {
  /** Stable key the draft flow accepts to prefill (e.g. `claim-notice-20.1`). */
  key: string;
  /** Human title shown in the picker grid. */
  title: string;
  /** Governing FIDIC Sub-Clause reference. */
  fidicClause: string;
  category: LetterCategory;
  /** Prefill scaffold with `{{placeholders}}` for the reviewer to complete. */
  bodySkeleton: string;
}

export const LETTER_TEMPLATES: LetterTemplate[] = [
  {
    key: 'claim-notice-20.1',
    title: 'Claim Notice (Contractor → Engineer)',
    fidicClause: 'Sub-Clause 20.1',
    category: 'claim',
    bodySkeleton:
      'We hereby give Notice under Sub-Clause 20.1 of our intention to claim {{entitlement}} arising from ' +
      '{{event}} which we first became aware of on {{awarenessDate}}. Particulars and substantiation will ' +
      'follow within 42 days in accordance with the Contract.',
  },
  {
    key: 'eot-request-8.4',
    title: 'Extension of Time Request',
    fidicClause: 'Sub-Clause 8.4',
    category: 'claim',
    bodySkeleton:
      'Pursuant to Sub-Clause 8.4, we request an Extension of Time of {{days}} days for the Time for ' +
      'Completion, on the grounds of {{cause}}. The delay analysis ({{methodology}}) and supporting records ' +
      'are enclosed. We reserve our rights under Sub-Clause 20.1.',
  },
  {
    key: 'variation-13',
    title: 'Variation Instruction / Proposal',
    fidicClause: 'Sub-Clause 13',
    category: 'instruction',
    bodySkeleton:
      'In accordance with Sub-Clause 13.1/13.3, the following Variation is {{instructed_or_proposed}}: ' +
      '{{variation_description}}. Please submit your proposal for the adjustment to the Contract Price and ' +
      'Time for Completion within {{days}} days, with the breakdown required under Sub-Clause 13.3.',
  },
  {
    key: 'employer-claim-2.5',
    title: "Employer's Claim Notice",
    fidicClause: 'Sub-Clause 2.5',
    category: 'claim',
    bodySkeleton:
      'The Employer gives Notice under Sub-Clause 2.5 of a claim for {{amount_or_eot}} in respect of ' +
      '{{ground}}. The particulars and the Contract basis for the claim are set out below; the Engineer is ' +
      'requested to proceed under Sub-Clause 3.5 to agree or determine the matter.',
  },
  {
    key: 'instruction-response-3',
    title: "Response to Engineer's Instruction",
    fidicClause: 'Sub-Clause 3.3',
    category: 'response',
    bodySkeleton:
      'We acknowledge the Engineer\'s Instruction {{instruction_ref}} dated {{date}} issued under ' +
      'Sub-Clause 3.3. {{acceptance_or_reservation}}. Where the Instruction constitutes a Variation we ' +
      'reserve our entitlement under Sub-Clause 13 and will notify accordingly under Sub-Clause 20.1.',
  },
  {
    key: 'delay-warning-8.3',
    title: 'Delay Warning / Early Warning',
    fidicClause: 'Sub-Clause 8.3',
    category: 'notice',
    bodySkeleton:
      'In accordance with Sub-Clause 8.3, we give early warning of a probable future event likely to ' +
      'adversely affect the Works, namely {{event}}, with an estimated effect of {{effect}} on progress/cost. ' +
      'We propose the following mitigation: {{mitigation}}.',
  },
  {
    key: 'payment-notice-14',
    title: 'Payment Notice / Application',
    fidicClause: 'Sub-Clause 14.3',
    category: 'notice',
    bodySkeleton:
      'We submit our Statement under Sub-Clause 14.3 for the amount of {{amount}} for the period ending ' +
      '{{period}}, comprising {{breakdown}}. The Engineer is requested to issue the Interim Payment ' +
      'Certificate within the period stated in Sub-Clause 14.6.',
  },
  {
    key: 'ncr-escalation-7.5',
    title: 'Non-Conformance Escalation',
    fidicClause: 'Sub-Clause 7.5',
    category: 'notice',
    bodySkeleton:
      'Following NCR {{ncr_ref}} and our prior notice(s), the non-conforming work at {{location}} remains ' +
      'unresolved. Under Sub-Clause 7.5/7.6 we require the Contractor to {{required_action}} by {{deadline}}, ' +
      'failing which the Employer reserves the right to act under Sub-Clause 11.4 / 15.1.',
  },
];

/** Look up a template by key, or null when the key is unknown. */
export function templateByKey(key: string): LetterTemplate | null {
  return LETTER_TEMPLATES.find((t) => t.key === key) ?? null;
}

/**
 * Derive a correspondence-library category for a persisted letter. Prefers an
 * explicit template match (via the letter's clause), then falls back to the
 * letter's `trigger`:
 *  - `incoming-letter`  → `response`  (a reply to the contractor)
 *  - `compliance-flag`  → `notice`    (a notice we are raising)
 * Anything unmatched defaults to `notice`.
 */
export function deriveCategory(
  trigger: string | null | undefined,
  fidicClauseRef: string | null | undefined,
): LetterCategory {
  if (fidicClauseRef) {
    const match = LETTER_TEMPLATES.find((t) =>
      fidicClauseRef.includes(t.fidicClause.replace(/^Sub-Clause\s+/i, '')),
    );
    if (match) return match.category;
  }
  if (trigger === 'incoming-letter') return 'response';
  if (trigger === 'compliance-flag') return 'notice';
  return 'notice';
}
