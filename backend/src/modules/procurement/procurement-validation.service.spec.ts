import { ObjectLiteral, Repository } from 'typeorm';

import { Activity, ProcurementFinding, ProcurementPackage, Project, Vendor } from '../canonical/entities';
import { ProcurementValidationService } from './procurement-validation.service';

/** Minimal repo mock: find returns canned rows, save echoes, findOne returns one. */
function repo<T extends ObjectLiteral>(rows: T[] = [], one: T | null = null) {
  return {
    find: jest.fn(async () => rows),
    findOne: jest.fn(async () => one),
    save: jest.fn(async (row: T) => row),
    create: jest.fn((row: T) => row),
  } as unknown as Repository<T>;
}

describe('ProcurementValidationService — long-lead EOT exposure on the critical path', () => {
  const projectKey = 'P-1000';

  const longLeadPkg = {
    businessKey: 'PKG-009', title: 'Chillers', longLead: true, leadTimeDays: 120,
    requiredOnSiteDate: '2026-07-10', status: 'planned', activityBusinessKey: 'A-CRIT',
    bimQuantity: null, procuredQuantity: null, installedQuantity: null,
    plannedDeliveryDate: null, actualDeliveryDate: null, awardedVendorBusinessKey: null, unit: 'no',
  } as unknown as ProcurementPackage;

  function build(critical: boolean) {
    const activity = { businessKey: 'A-CRIT', isCritical: critical, totalFloat: critical ? 0 : 12, projectId: 'proj-1', isCurrent: true } as unknown as Activity;
    const findings = repo<ProcurementFinding>([]);
    const svc = new ProcurementValidationService(
      findings,
      repo<ProcurementPackage>([longLeadPkg]),
      repo<Vendor>([]),
      repo<Project>([], { id: 'proj-1', businessKey: projectKey, isCurrent: true } as unknown as Project),
      repo<Activity>([activity]),
    );
    return { svc, findings };
  }

  it('flags the long-lead exposure as critical with an EOT note when the mapped activity is on the critical path', async () => {
    const { svc } = build(true);
    // asOf well before the required date so lead time exceeds what remains.
    const result = await svc.validate(projectKey, '2026-06-01');
    const longLead = result.findings.find((f) => f.findingType === 'long-lead-exposure')!;
    expect(longLead).toBeDefined();
    expect(longLead.severity).toBe('critical');
    expect(longLead.title).toContain('critical path');
    expect((longLead.refs as Record<string, unknown>).onCriticalPath).toBe(true);
    expect((longLead.refs as Record<string, unknown>).eotExposureDays).toBeGreaterThan(0);
    expect(longLead.description).toContain('EOT');
  });

  it('does not raise the EOT note when the mapped activity is not critical', async () => {
    const { svc } = build(false);
    const result = await svc.validate(projectKey, '2026-06-01');
    const longLead = result.findings.find((f) => f.findingType === 'long-lead-exposure')!;
    expect(longLead).toBeDefined();
    expect((longLead.refs as Record<string, unknown>).onCriticalPath).toBe(false);
    expect((longLead.refs as Record<string, unknown>).eotExposureDays).toBeNull();
    expect(longLead.title).not.toContain('critical path');
  });
});
