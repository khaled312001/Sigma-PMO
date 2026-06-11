import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { Project, Scenario } from '../canonical/entities';
import {
  COST_OF_DELAY_OVERHEAD_FACTOR,
  PortfolioScenarioService,
} from './portfolio-scenario.service';

/**
 * Deterministic acceptance for the portfolio what-if + impact roll-up.
 *
 *  - cost-of-delay = (BAC / plannedDurationDays) * delayDays * (1 + overhead).
 *  - adjusted finish = plannedFinish + delayDays (calendar).
 *  - missing BAC / duration / finish → null figure + honest note (no fabrication).
 *  - portfolio-impact buckets only OPEN scenarios and flags placeholder impacts.
 */

function makeProject(over: Partial<Project>): Project {
  return {
    id: `proj-${over.businessKey}`,
    businessKey: 'P-1000',
    name: 'Tower A',
    isCurrent: true,
    plannedStart: '2026-01-01',
    plannedFinish: '2026-12-31',
    budgetAtCompletion: '36500000.00',
    ...over,
  } as unknown as Project;
}

function projectRepo(rows: Project[]): Repository<Project> {
  return {
    findOne: async ({ where }: { where: { businessKey: string } }) =>
      rows.find((r) => r.businessKey === where.businessKey) ?? null,
    find: async () => rows,
  } as unknown as Repository<Project>;
}

function scenarioRepo(rows: Scenario[]): Repository<Scenario> {
  return {
    find: async ({ where }: { where?: { status?: string } }) =>
      rows.filter((r) => (where?.status ? r.status === where.status : true)),
  } as unknown as Repository<Scenario>;
}

describe('PortfolioScenarioService.portfolioWhatIf', () => {
  it('computes cost-of-delay with the named overhead basis + shifted finish', async () => {
    // BAC 36,500,000 over 365 inclusive days = 100,000/day.
    const p = makeProject({ businessKey: 'P-1000', plannedStart: '2026-01-01', plannedFinish: '2026-12-31' });
    const svc = new PortfolioScenarioService(scenarioRepo([]), projectRepo([p]));

    const r = await svc.portfolioWhatIf({ 'P-1000': 10 });
    const row = r.projects[0];

    // 365 inclusive days → dailyBurn 100k → 100k * 10 * 1.15 = 1,150,000.
    expect(row.plannedDurationDays).toBe(365);
    expect(row.costOfDelay).toBeCloseTo(100000 * 10 * (1 + COST_OF_DELAY_OVERHEAD_FACTOR), 2);
    expect(row.adjustedForecastFinish).toBe('2027-01-10');
    expect(row.note).toBeNull();
    expect(r.totals.totalCostOfDelay).toBeCloseTo(1150000, 2);
    expect(r.totals.totalDelayDays).toBe(10);
  });

  it('honestly nulls cost when BAC is missing and notes why', async () => {
    const p = makeProject({ businessKey: 'P-2000', budgetAtCompletion: null });
    const svc = new PortfolioScenarioService(scenarioRepo([]), projectRepo([p]));

    const r = await svc.portfolioWhatIf({ 'P-2000': 5 });
    expect(r.projects[0].costOfDelay).toBeNull();
    expect(r.projects[0].note).toContain('budgetAtCompletion');
    // Finish still shifts even without a cost.
    expect(r.projects[0].adjustedForecastFinish).not.toBeNull();
  });

  it('handles an unknown project key without throwing', async () => {
    const svc = new PortfolioScenarioService(scenarioRepo([]), projectRepo([]));
    const r = await svc.portfolioWhatIf({ 'P-NOPE': 3 });
    expect(r.projects[0].costOfDelay).toBeNull();
    expect(r.projects[0].currentForecastFinish).toBeNull();
  });

  it('rejects an out-of-range delay', async () => {
    const svc = new PortfolioScenarioService(scenarioRepo([]), projectRepo([makeProject({})]));
    await expect(svc.portfolioWhatIf({ 'P-1000': -1 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.portfolioWhatIf({})).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PortfolioScenarioService.portfolioImpact', () => {
  it('buckets only OPEN scenarios and flags placeholder impacts', async () => {
    const open = {
      id: 's1', name: 'Compression A', projectBusinessKey: 'P-1000', status: 'open',
      forkedFromAt: new Date('2026-06-01T00:00:00Z'), summary: 'try crashing',
      baselineSnapshot: { schedule: { activityCount: 12 }, alerts: { critical: 2 }, project: { plannedFinish: '2026-12-31' } },
    } as unknown as Scenario;
    const committed = { ...open, id: 's2', status: 'committed' } as unknown as Scenario;

    const svc = new PortfolioScenarioService(
      scenarioRepo([open, committed]),
      projectRepo([makeProject({ businessKey: 'P-1000' })]),
    );

    const r = await svc.portfolioImpact();
    expect(r.totals.openScenarios).toBe(1);
    expect(r.totals.projectsWithScenarios).toBe(1);
    expect(r.scenarios[0].projectName).toBe('Tower A');
    expect(r.scenarios[0].impact.isPlaceholder).toBe(true);
    expect(r.scenarios[0].impact.baseline.activityCount).toBe(12);
    expect(r.scenarios[0].impact.baseline.criticalAlerts).toBe(2);
    expect(r.allImpactsArePlaceholders).toBe(true);
  });

  it('surfaces real deltas when the snapshot carries them', async () => {
    const open = {
      id: 's3', name: 'Clash X', projectBusinessKey: 'P-1000', status: 'open',
      forkedFromAt: new Date('2026-06-02T00:00:00Z'), summary: '',
      baselineSnapshot: { kind: 'clash-impact', scheduleDeltaDays: 7, costDelta: 250000 },
    } as unknown as Scenario;

    const svc = new PortfolioScenarioService(scenarioRepo([open]), projectRepo([makeProject({})]));
    const r = await svc.portfolioImpact();
    expect(r.scenarios[0].kind).toBe('clash-impact');
    expect(r.scenarios[0].impact.scheduleDeltaDays).toBe(7);
    expect(r.scenarios[0].impact.costDelta).toBe(250000);
    expect(r.scenarios[0].impact.isPlaceholder).toBe(false);
    expect(r.allImpactsArePlaceholders).toBe(false);
  });
});
