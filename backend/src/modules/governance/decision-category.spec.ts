import {
  AUTO_APPROVAL_BLOCKED_CATEGORIES,
  deriveDecisionCategory,
  isAutoApprovalBlocked,
} from './decision-category';

/**
 * Decision-category derivation (Req R7). Pure, deterministic classification of a
 * decision into one domain from the triggering alert code + FIDIC clause, plus
 * the auto-approval-blocked set (financial | contractual | safety).
 */
describe('deriveDecisionCategory', () => {
  it('classifies cost/payment alerts as financial', () => {
    expect(deriveDecisionCategory('COST_OVERRUN', 'Sub-Clause 13 / 14')).toBe('financial');
    expect(deriveDecisionCategory('PAYMENT_CERTIFICATE_LATE', null)).toBe('financial');
    expect(deriveDecisionCategory('CLAIM_VALUATION_DISPUTE', null)).toBe('financial');
  });

  it('classifies safety/fire/authority alerts as safety (wins over a clause)', () => {
    expect(deriveDecisionCategory('SAFETY_VIOLATION', 'Sub-Clause 4.8')).toBe('safety');
    expect(deriveDecisionCategory('FIRE_LIFE_SAFETY_GAP', null)).toBe('safety');
    expect(deriveDecisionCategory('AUTHORITY_PERMIT_MISSING', null)).toBe('safety');
  });

  it('classifies a decision with a FIDIC clause and no stronger signal as contractual', () => {
    // Unknown code but a mapped FIDIC clause → contractual.
    expect(deriveDecisionCategory('SOME_CONTRACT_NOTICE', null)).toBe('contractual');
    expect(deriveDecisionCategory('UNMAPPED_CODE', 'Sub-Clause 20.1')).toBe('contractual');
  });

  it('classifies schedule alerts as schedule (no clause)', () => {
    expect(deriveDecisionCategory('SCHEDULE_BEHIND_PLAN', null)).toBe('schedule');
    expect(deriveDecisionCategory('DURATION_OVERRUN', null)).toBe('schedule');
  });

  it('classifies quality alerts as quality', () => {
    expect(deriveDecisionCategory('QUALITY_NCR_RAISED', null)).toBe('quality');
    expect(deriveDecisionCategory('CLASH_HARD', null)).toBe('quality');
  });

  it('classifies resource/reporting/data alerts as operational', () => {
    expect(deriveDecisionCategory('RESOURCE_UNDERUSE', null)).toBe('operational');
    expect(deriveDecisionCategory('STALE_REPORTING', null)).toBe('operational');
    expect(deriveDecisionCategory('DATA_COMPLETENESS', null)).toBe('operational');
  });

  it('falls back to general for unknown codes with no clause', () => {
    expect(deriveDecisionCategory('NEW_RULE', null)).toBe('general');
    expect(deriveDecisionCategory(null, null)).toBe('general');
  });

  it('marks financial / contractual / safety as auto-approval-blocked', () => {
    expect(isAutoApprovalBlocked('financial')).toBe(true);
    expect(isAutoApprovalBlocked('contractual')).toBe(true);
    expect(isAutoApprovalBlocked('safety')).toBe(true);
    expect([...AUTO_APPROVAL_BLOCKED_CATEGORIES].sort()).toEqual(['contractual', 'financial', 'safety']);
  });

  it('does NOT block schedule / quality / operational / general / null', () => {
    expect(isAutoApprovalBlocked('schedule')).toBe(false);
    expect(isAutoApprovalBlocked('quality')).toBe(false);
    expect(isAutoApprovalBlocked('operational')).toBe(false);
    expect(isAutoApprovalBlocked('general')).toBe(false);
    expect(isAutoApprovalBlocked(null)).toBe(false);
  });
});
