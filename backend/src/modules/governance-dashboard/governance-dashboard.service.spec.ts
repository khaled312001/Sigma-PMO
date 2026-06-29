import { NotFoundException } from '@nestjs/common';
import { ObjectLiteral, Repository } from 'typeorm';

import { GovernanceDashboardService } from './governance-dashboard.service';
import type { ExecutiveKpiService } from '../executive/executive-kpi.service';

/** A mock repository: find → rows, findOne → one, count → number (defaults rows.length). */
function repo<T extends ObjectLiteral>(rows: T[] = [], one: T | null = null, countValue?: number): Repository<T> {
  return {
    find: jest.fn(async () => rows),
    findOne: jest.fn(async () => one),
    count: jest.fn(async () => (countValue ?? rows.length)),
  } as unknown as Repository<T>;
}

describe('GovernanceDashboardService — read-only per-project governance view', () => {
  const projectKey = 'P-1000';
  const project = { id: 'proj-uuid', businessKey: projectKey, isCurrent: true, name: 'Tower A' };

  function build(over: Partial<Record<string, Repository<Record<string, unknown>>>> = {}, kpisOver?: Partial<ExecutiveKpiService>): GovernanceDashboardService {
    const repos = {
      projects: repo([], project as Record<string, unknown>),
      drawings: repo([], null, 3),
      records: repo([], null, 1),
      clashItems: repo([], null, 12),
      boqs: repo([{ id: 'boq-1' }]),
      boqItems: repo([], null, 240),
      procurement: repo([], null, 7),
      activities: repo([], null, 320),
      siteEvidence: repo([], null, 18),
      reports: repo([], null, 4),
      claims: repo([{ id: 'cl-1' }, { id: 'cl-2' }]),
      evidenceRooms: repo([], null, 2),
      evidenceLinks: repo([], null, 9),
      alerts: repo([{ id: 'al-1' }]),
      decisions: repo([
        { id: 'gd-1', escalationLevel: 'L2', responsibleParty: 'contractor', rationale: 'Notice due', createdAt: new Date('2026-06-20') },
        { id: 'gd-2', escalationLevel: 'L1', responsibleParty: 'client', rationale: 'Acknowledge', createdAt: new Date('2026-06-21') },
      ]),
      reviews: repo([{ decisionId: 'gd-1', action: 'approve' }]),
      snapshots: repo([], { status: 'orange', score: 0.42, computedAt: new Date('2026-06-28T09:00:00Z') }),
    };
    Object.assign(repos, over);
    const kpis = {
      computeKpis: jest.fn(async () => ({ governanceStatus: 'orange', projectHealthScore: 71 })),
      ...kpisOver,
    } as unknown as ExecutiveKpiService;
    return new GovernanceDashboardService(
      repos.projects as never, repos.drawings as never, repos.records as never, repos.clashItems as never,
      repos.boqs as never, repos.boqItems as never, repos.procurement as never, repos.activities as never,
      repos.siteEvidence as never, repos.reports as never, repos.claims as never, repos.evidenceRooms as never,
      repos.evidenceLinks as never, repos.alerts as never, repos.decisions as never, repos.reviews as never,
      repos.snapshots as never, kpis,
    );
  }

  it('throws NotFound when the project does not exist', async () => {
    const svc = build({ projects: repo([], null) });
    await expect(svc.build(projectKey)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('aggregates source inputs, outputs and evidence counts', async () => {
    const svc = build();
    const d = await svc.build(projectKey);
    expect(d.sourceInputs).toEqual({
      drawings: 3, bimModels: 1, clashes: 12, boqItems: 240,
      procurementPackages: 7, activities: 320, siteEvidenceCaptures: 18,
    });
    expect(d.outputs.monthlyReports).toBe(4);
    expect(d.outputs.governanceStatus).toBe('orange');
    expect(d.outputs.kpis).toMatchObject({ governanceStatus: 'orange' });
    expect(d.evidence).toEqual({ claims: 2, evidenceRooms: 2, siteEvidence: 18, claimEvidenceLinks: 9 });
  });

  it('counts decisions as approved vs awaiting a human (nothing auto-approved)', async () => {
    const svc = build();
    const d = await svc.build(projectKey);
    expect(d.humanApproval.decisionsTotal).toBe(2);
    expect(d.humanApproval.approved).toBe(1); // only gd-1 has an approve review
    expect(d.humanApproval.awaiting).toBe(1);
    expect(d.humanApproval.note).toMatch(/auto-approved/i);
  });

  it('surfaces the latest recommended decision with requiresHumanApproval:true', async () => {
    const svc = build();
    const d = await svc.build(projectKey);
    expect(d.recommendedDecision.requiresHumanApproval).toBe(true);
    expect(d.recommendedDecision.source).toBe('governance-status-snapshot');
    expect(d.recommendedDecision.status).toBe('orange');
  });

  it('falls back to the latest governance decision when no status snapshot exists', async () => {
    const svc = build({ snapshots: repo([], null) });
    const d = await svc.build(projectKey);
    expect(d.recommendedDecision.source).toBe('governance-decision');
    expect(d.recommendedDecision.requiresHumanApproval).toBe(true);
  });

  it('degrades gracefully when KPIs cannot be computed', async () => {
    const svc = build({}, { computeKpis: jest.fn(async () => { throw new Error('no EVM yet'); }) } as Partial<ExecutiveKpiService>);
    const d = await svc.build(projectKey);
    expect(d.outputs.kpis).toBeNull();
    // governanceStatus still comes from the snapshot.
    expect(d.outputs.governanceStatus).toBe('orange');
  });
});
