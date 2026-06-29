import { IsNull } from 'typeorm';

import { FeasibilityAssessment } from '../canonical/entities/feasibility-assessment.entity';
import { FinancialModelService } from '../feasibility/financial-model.service';
import { BankabilityService } from './bankability.service';

/**
 * BankabilityService project-scoping (Mr. Ayham acceptance 2026-06-28). The
 * `find` stub honours the `where` clause (projectBusinessKey + level) so we can
 * assert that bankability binds to the P-1000 assessment over a newer unrelated
 * run, and falls back to the global (null-scoped) latest when none is scoped.
 */
describe('BankabilityService — project-scoped latestAssessment', () => {
  function assessment(over: Partial<FeasibilityAssessment>): FeasibilityAssessment {
    return {
      id: over.id ?? 'a',
      opportunityId: 'o',
      projectBusinessKey: over.projectBusinessKey ?? null,
      level: over.level ?? 1,
      inputs: over.inputs ?? { capex: 100_000_000 },
      assumptions: {},
      results: over.results ?? { npv: 5_000_000, projectIrr: 0.18, dscr: { min: 1.4, avg: 1.6 } },
      riskRating: over.riskRating ?? 'moderate',
      recommendation: over.recommendation ?? 'proceed',
      governanceStatus: 'green',
      confidence: 0.8,
      narrative: null,
      createdBy: null,
      companyId: null,
      journeyCorrelationId: null,
      createdAt: over.createdAt ?? new Date('2026-01-01'),
    } as unknown as FeasibilityAssessment;
  }

  function svcWith(rows: FeasibilityAssessment[]): BankabilityService {
    const matches = (row: FeasibilityAssessment, where: Record<string, unknown>): boolean => {
      for (const [k, v] of Object.entries(where)) {
        const cell = (row as unknown as Record<string, unknown>)[k];
        // IsNull() is an object with a distinct constructor name.
        if (v && typeof v === 'object' && v.constructor && v.constructor.name === 'FindOperator') {
          if (cell !== null && cell !== undefined) return false;
        } else if (cell !== v) {
          return false;
        }
      }
      return true;
    };
    const assessmentsRepo = {
      find: async (opts: { where?: Record<string, unknown>; take?: number }) => {
        const where = opts?.where ?? {};
        const found = rows
          .filter((r) => matches(r, where))
          .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
        return opts?.take ? found.slice(0, opts.take) : found;
      },
    } as never;
    const facilitiesRepo = { find: async () => [] } as never;
    return new BankabilityService(assessmentsRepo, facilitiesRepo, new FinancialModelService());
  }

  // sanity: the IsNull marker we feed the stub is the one the service uses.
  it('IsNull marker resolves to a FindOperator', () => {
    expect(IsNull().constructor.name).toBe('FindOperator');
  });

  it('binds to the P-1000 assessment, not the newer unrelated run', async () => {
    const svc = svcWith([
      assessment({ id: 'p1000', projectBusinessKey: 'P-1000', createdAt: new Date('2026-02-01'), results: { npv: 1, projectIrr: 0.2, dscr: { min: 1.5, avg: 1.7 } } }),
      assessment({ id: 'newer-other', projectBusinessKey: 'P-2000', createdAt: new Date('2026-06-01'), results: { npv: 1, projectIrr: 0.1, dscr: { min: 0.8, avg: 0.9 } } }),
      assessment({ id: 'newest-global', projectBusinessKey: null, createdAt: new Date('2026-06-20'), results: { npv: 1, projectIrr: 0.05, dscr: { min: 0.5, avg: 0.6 } } }),
    ]);
    const out = await svc.assess('P-1000');
    expect(out.feasibilityBasis?.assessmentId).toBe('p1000');
    // P-1000's healthy 1.5x DSCR drives the verdict, not the global 0.5x.
    expect(out.dscr.effectiveDscr).toBe(1.5);
  });

  it('prefers the project-scoped Level-2 run over a Level-1 scoped run', async () => {
    const svc = svcWith([
      assessment({ id: 'l1', projectBusinessKey: 'P-1000', level: 1, createdAt: new Date('2026-06-01') }),
      assessment({ id: 'l2', projectBusinessKey: 'P-1000', level: 2, createdAt: new Date('2026-02-01') }),
    ]);
    const out = await svc.assess('P-1000');
    expect(out.feasibilityBasis?.assessmentId).toBe('l2');
  });

  it('falls back to the global latest when the project has no scoped assessment', async () => {
    const svc = svcWith([
      assessment({ id: 'global', projectBusinessKey: null, createdAt: new Date('2026-05-01') }),
      assessment({ id: 'other', projectBusinessKey: 'P-9', createdAt: new Date('2026-06-01') }),
    ]);
    const out = await svc.assess('P-1000');
    expect(out.feasibilityBasis?.assessmentId).toBe('global');
  });
});
