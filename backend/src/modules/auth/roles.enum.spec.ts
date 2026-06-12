import { Role, ROLE_CAPABILITIES } from './roles.enum';

/**
 * Capability matrix contract — Wave 8 (post-meeting plan §7, ADR-0010 §7).
 *
 * These assertions encode the meeting decisions verbatim and serve as a
 * regression net: any future role/capability re-shuffle has to update this
 * spec and update the user-facing docs together.
 */
describe('ROLE_CAPABILITIES — plan §7 matrix', () => {
  describe('canSimulate', () => {
    // Wave 7: the 2026-06-08 meeting grants contractor + subcontractor
    // sandbox simulation (Scenario writes never touch canonical truth).
    it.each([
      Role.SIGMA_ADMIN,
      Role.CLIENT,
      Role.CONSULTANT,
      Role.CONTRACTOR,
      Role.SUBCONTRACTOR,
    ])('%s can simulate', (role) => {
      expect(ROLE_CAPABILITIES[role].canSimulate).toBe(true);
    });

    it('sigma_reviewer cannot simulate (Khaled-default pending open question 13)', () => {
      // Plan §7: the reviewer charter is read-only audit; simulation is a
      // write-shaped affordance. Flip on Al Ayham's explicit confirmation.
      expect(ROLE_CAPABILITIES[Role.SIGMA_REVIEWER].canSimulate).toBe(false);
    });
  });

  describe('canEditPersonas', () => {
    it('sigma_admin is the only role that can edit personas', () => {
      expect(ROLE_CAPABILITIES[Role.SIGMA_ADMIN].canEditPersonas).toBe(true);
    });

    it.each([
      Role.SIGMA_REVIEWER,
      Role.CLIENT,
      Role.CONSULTANT,
      Role.CONTRACTOR,
      Role.SUBCONTRACTOR,
    ])('%s cannot edit personas', (role) => {
      expect(ROLE_CAPABILITIES[role].canEditPersonas).toBe(false);
    });
  });

  describe('per-source-type ingestion split (plan §7 / §2.9)', () => {
    it('contractor ingests his own schedule, BoQ, and letters', () => {
      const caps = ROLE_CAPABILITIES[Role.CONTRACTOR];
      expect(caps.canIngestSchedule).toBe(true);
      expect(caps.canIngestBoQ).toBe(true);
      expect(caps.canIngestLetter).toBe(true);
    });

    it('consultant reads + proposes + simulates but never ingests', () => {
      const caps = ROLE_CAPABILITIES[Role.CONSULTANT];
      expect(caps.canIngest).toBe(false);
      expect(caps.canIngestSchedule).toBe(false);
      expect(caps.canIngestBoQ).toBe(false);
      expect(caps.canIngestLetter).toBe(false);
    });

    it('client intakes letters but not schedules / BoQ', () => {
      const caps = ROLE_CAPABILITIES[Role.CLIENT];
      expect(caps.canIngestLetter).toBe(true);
      expect(caps.canIngestSchedule).toBe(false);
      expect(caps.canIngestBoQ).toBe(false);
    });
  });

  describe('named approval gates (plan §7)', () => {
    // The decision-authority tier. Expanded 2026-06-12 beyond admin + client to
    // the equivalent ecosystem roles: OWNER (employer/asset owner — client-
    // equivalent) and GOVERNANCE_BOARD (strategic approval body).
    const APPROVAL_AUTHORITY = new Set<Role>([
      Role.SIGMA_ADMIN,
      Role.CLIENT,
      Role.OWNER,
      Role.GOVERNANCE_BOARD,
    ]);

    it('letter approval belongs to the decision-authority tier', () => {
      for (const role of Object.values(Role)) {
        expect(ROLE_CAPABILITIES[role].canApproveLetter).toBe(APPROVAL_AUTHORITY.has(role));
      }
    });

    it('baseline approval belongs to the decision-authority tier (dual-signature pool)', () => {
      for (const role of Object.values(Role)) {
        expect(ROLE_CAPABILITIES[role].canApproveBaseline).toBe(APPROVAL_AUTHORITY.has(role));
      }
    });

    it('computer-use trigger is admin-only until ADR-0011 flips on Q6', () => {
      for (const role of Object.values(Role)) {
        const expected = role === Role.SIGMA_ADMIN;
        expect(ROLE_CAPABILITIES[role].canTriggerComputerUse).toBe(expected);
      }
    });
  });

  describe('contractor slice (plan §7 flips)', () => {
    it('contractor evaluates rules + generates summaries on his own slice', () => {
      const caps = ROLE_CAPABILITIES[Role.CONTRACTOR];
      expect(caps.canEvaluateRules).toBe(true);
      expect(caps.canGenerateSummary).toBe(true);
      expect(caps.canReadAll).toBe(false);
    });

    it('subcontractor is read + progress-update only (no rules, no summaries)', () => {
      const caps = ROLE_CAPABILITIES[Role.SUBCONTRACTOR];
      expect(caps.canRead).toBe(true);
      expect(caps.canEvaluateRules).toBe(false);
      expect(caps.canGenerateSummary).toBe(false);
      expect(caps.canReadAll).toBe(false);
    });
  });

  it('every role carries every flag (no undefined holes)', () => {
    const expectedKeys = [
      'canRead',
      'canIngest',
      'canEvaluateRules',
      'canEditPolicy',
      'canGenerateSummary',
      'canReadAll',
      'canSimulate',
      'canEditPersonas',
      'canIngestSchedule',
      'canIngestBoQ',
      'canIngestLetter',
      'canApproveLetter',
      'canApproveBaseline',
      'canTriggerComputerUse',
    ];
    for (const role of Object.values(Role)) {
      const caps = ROLE_CAPABILITIES[role];
      for (const key of expectedKeys) {
        expect(typeof (caps as Record<string, unknown>)[key]).toBe('boolean');
      }
    }
  });
});
