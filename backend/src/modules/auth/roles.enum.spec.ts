import { Role, ROLE_CAPABILITIES } from './roles.enum';

/**
 * Capability matrix contract — Wave 1 (post-meeting plan §2.9, ADR-0010 §7).
 *
 * These assertions encode the meeting decisions verbatim and serve as a
 * regression net: any future role/capability re-shuffle has to update this
 * spec and update the user-facing docs together.
 */
describe('ROLE_CAPABILITIES — Wave 1 matrix', () => {
  describe('canSimulate', () => {
    it('contractor is the only role that cannot simulate', () => {
      expect(ROLE_CAPABILITIES[Role.CONTRACTOR].canSimulate).toBe(false);
    });

    it.each([
      Role.SIGMA_ADMIN,
      Role.SIGMA_REVIEWER,
      Role.CLIENT,
      Role.CONSULTANT,
    ])('%s can simulate', (role) => {
      expect(ROLE_CAPABILITIES[role].canSimulate).toBe(true);
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
    ])('%s cannot edit personas', (role) => {
      expect(ROLE_CAPABILITIES[role].canEditPersonas).toBe(false);
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
    ];
    for (const role of Object.values(Role)) {
      const caps = ROLE_CAPABILITIES[role];
      for (const key of expectedKeys) {
        expect(typeof (caps as Record<string, unknown>)[key]).toBe('boolean');
      }
    }
  });
});
