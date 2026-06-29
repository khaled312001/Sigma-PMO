import { NotFoundException } from '@nestjs/common';
import { ObjectLiteral, Repository } from 'typeorm';

import { JourneyService } from './journey.service';

/** A mock repository whose find/findOne return canned rows. */
function repo<T extends ObjectLiteral>(rows: T[] = [], one: T | null = null): Repository<T> {
  return {
    find: jest.fn(async () => rows),
    findOne: jest.fn(async () => one),
  } as unknown as Repository<T>;
}

describe('JourneyService — cross-module journey assembler', () => {
  const projectKey = 'P-1000';
  const project = {
    id: 'proj-uuid', businessKey: projectKey, isCurrent: true, name: 'Tower A',
    opportunityId: 'opp-uuid',
  };

  function build(over: Partial<Record<string, Repository<Record<string, unknown>>>> = {}): JourneyService {
    const repos = {
      projects: repo([] as Array<Record<string, unknown>>, project as Record<string, unknown>),
      opportunities: repo([], { id: 'opp-uuid', code: 'INV-0007', title: 'Tower A', stage: 'approved', projectType: 'residential', journeyCorrelationId: 'JC-1' }),
      concepts: repo([{ id: 'c1', filename: 'sketch.pdf', extractionStatus: 'confirmed', journeyCorrelationId: 'JC-1' }]),
      assessments: repo([{ id: 'a1', level: 1, recommendation: 'proceed', riskRating: 'low', journeyCorrelationId: null }]),
      studySections: repo([{ id: 's1', sectionKey: 'executive_summary', title: 'Exec', status: 'approved', journeyCorrelationId: null }]),
      drawings: repo([{ id: 'd1', filename: 'arch.pdf', format: 'pdf', journeyCorrelationId: 'JC-2' }]),
      boqs: repo([{ id: 'b1', businessKey: `boq:${projectKey}`, totalAmount: '100.00', currency: 'AED', journeyCorrelationId: null }]),
      activities: repo([{ id: 'act1', businessKey: 'A-1', wbsCode: '1.1', name: 'Excavate', plannedStart: '2026-01-01', plannedFinish: '2026-02-01' }]),
      letters: repo([{ id: 'l1', subject: 'Notice', trigger: 'incoming-letter', status: 'draft', fidicClauseRef: '20.1' }]),
      claims: repo([{ id: 'cl1', title: 'EOT', type: 'eot', status: 'potential', fidicClause: '8.4' }]),
      evidenceRooms: repo([{ id: 'er1', title: 'Dispute room', kind: 'standard', status: 'open', journeyCorrelationId: null }]),
      siteEvidence: repo([{ id: 'se1', mediaKind: 'photo', filename: 'crack.jpg', capturedAt: '2026-01-05', reportDate: '2026-01-05', activityKey: 'A-1', locationLabel: 'Level 3', findingType: 'quality', sha256: 'abc123' }]),
      reports: repo([{ id: 'r1', periodKey: '2026-01', month: '2026-01', audience: 'owner', status: 'generated', journeyCorrelationId: null }]),
      alerts: repo([{ id: 'al1' }]),
      decisions: repo([{ id: 'gd1', alertId: 'al1', responsibleParty: 'contractor', escalationLevel: 'L1', journeyCorrelationId: null }]),
      ledger: repo([{ id: 'le1', dimension: 'cost', subjectKey: 'boq:2.1', stage: 'budget', value: '100.0000', journeyCorrelationId: null }]),
    };
    Object.assign(repos, over);
    return new JourneyService(
      repos.projects as never, repos.opportunities as never, repos.concepts as never,
      repos.assessments as never, repos.studySections as never, repos.drawings as never,
      repos.boqs as never, repos.activities as never, repos.letters as never,
      repos.claims as never, repos.evidenceRooms as never, repos.reports as never,
      repos.alerts as never, repos.decisions as never, repos.ledger as never,
      repos.siteEvidence as never,
    );
  }

  it('throws NotFound when the project does not exist', async () => {
    const svc = build({ projects: repo([], null) });
    await expect(svc.chain(projectKey)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assembles the chain in lifecycle order', async () => {
    const svc = build();
    const chain = await svc.chain(projectKey);
    expect(chain.projectKey).toBe(projectKey);
    expect(chain.opportunityId).toBe('opp-uuid');
    const order = chain.legs.map((l) => l.stage);
    expect(order).toEqual([
      'opportunity', 'concept', 'feasibility', 'study', 'bim', 'boq', 'schedule',
      'cost-ledger', 'contract', 'claims', 'site-evidence', 'report', 'decision',
    ]);
  });

  it('populates each leg from its repository', async () => {
    const svc = build();
    const chain = await svc.chain(projectKey);
    const byStage = Object.fromEntries(chain.legs.map((l) => [l.stage, l.items]));
    expect(byStage.opportunity).toHaveLength(1);
    expect(byStage.concept[0]).toMatchObject({ filename: 'sketch.pdf' });
    expect(byStage.bim[0]).toMatchObject({ format: 'pdf' });
    expect(byStage.schedule[0]).toMatchObject({ name: 'Excavate' });
    expect(byStage.decision[0]).toMatchObject({ alertId: 'al1' });
  });

  it('rolls up distinct journeyCorrelationIds discovered across the chain', async () => {
    const svc = build();
    const chain = await svc.chain(projectKey);
    expect(chain.correlationIds.sort()).toEqual(['JC-1', 'JC-2']);
  });

  it('marks each leg present:true with a count when it has items', async () => {
    const svc = build();
    const chain = await svc.chain(projectKey);
    const concept = chain.legs.find((l) => l.stage === 'concept')!;
    expect(concept).toMatchObject({ leg: 'concept', present: true, count: 1 });
    expect(concept.note).toBeUndefined();
  });

  it('records an empty leg as present:false with an explanatory note', async () => {
    const svc = build({ claims: repo([]) });
    const chain = await svc.chain(projectKey);
    const claims = chain.legs.find((l) => l.stage === 'claims')!;
    expect(claims.present).toBe(false);
    expect(claims.count).toBe(0);
    expect(typeof claims.note).toBe('string');
    expect(claims.note!.length).toBeGreaterThan(0);
  });

  it('merges SiteEvidence captures into the site-evidence leg alongside evidence rooms', async () => {
    const svc = build();
    const chain = await svc.chain(projectKey);
    const site = chain.legs.find((l) => l.stage === 'site-evidence')!;
    expect(site.present).toBe(true);
    expect(site.items.some((i) => i.source === 'evidence-room')).toBe(true);
    const capture = site.items.find((i) => i.source === 'site-capture');
    expect(capture).toMatchObject({ id: 'se1', mediaKind: 'photo', filename: 'crack.jpg' });
  });

  it('skips the investment half when the project has no opportunityId', async () => {
    const svc = build({ projects: repo([], { ...project, opportunityId: null }) });
    const chain = await svc.chain(projectKey);
    expect(chain.opportunityId).toBeNull();
    const byStage = Object.fromEntries(chain.legs.map((l) => [l.stage, l.items]));
    // Investment legs are empty without an opportunity; construction legs still load.
    expect(byStage.opportunity).toHaveLength(0);
    expect(byStage.concept).toHaveLength(0);
    expect(byStage.schedule).toHaveLength(1);
  });
});
