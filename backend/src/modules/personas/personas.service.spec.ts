import { Repository } from 'typeorm';

import { Layer } from '../../common/enums';
import { Persona } from '../canonical/entities';
import { PersonasService } from './personas.service';

function makeRepo(): {
  findOne: jest.Mock;
  find: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
} {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(async (e) => e),
    create: jest.fn((e) => ({ ...e })),
  };
}

describe('PersonasService', () => {
  let repo: ReturnType<typeof makeRepo>;
  let service: PersonasService;

  beforeEach(() => {
    repo = makeRepo();
    service = new PersonasService(repo as unknown as Repository<Persona>);
  });

  describe('findByLayer', () => {
    it('filters by layer + isCurrent=true', async () => {
      const planningRows = [{ id: 'p1', layer: Layer.PLANNING }] as Persona[];
      repo.find.mockResolvedValueOnce(planningRows);

      const out = await service.findByLayer(Layer.PLANNING);

      expect(out).toBe(planningRows);
      expect(repo.find).toHaveBeenCalledWith({
        where: { layer: Layer.PLANNING, isCurrent: true },
        order: { businessKey: 'ASC' },
      });
    });
  });

  describe('upsert', () => {
    it('creates v1 when no prior current row exists', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      const next = await service.upsert('planner-p6-25yr', {
        title: 'Planner',
        layer: Layer.PLANNING,
        systemPrompt: 'You are a planner.',
        rules: ['cite-bo-q'],
        modelTier: 'claude-sonnet',
        temperature: 0.2,
        ownedByRole: 'sigma_admin',
        authoredBy: 'tester',
      });

      expect(next.version).toBe(1);
      expect(next.isCurrent).toBe(true);
      expect(next.businessKey).toBe('planner-p6-25yr');
      expect(next.authoredBy).toBe('tester');
    });

    it('bumps version and flips isCurrent on the prior row', async () => {
      const prior: Persona = {
        id: 'prior-id',
        createdAt: new Date(),
        businessKey: 'planner-p6-25yr',
        version: 3,
        isCurrent: true,
        title: 'Old',
        layer: Layer.PLANNING,
        description: '',
        systemPrompt: 'old prompt',
        rules: [],
        modelTier: 'claude-sonnet',
        temperature: 0.2,
        ownedByRole: 'sigma_admin',
        authoredBy: 'system',
      };
      repo.findOne.mockResolvedValueOnce(prior);

      const next = await service.upsert('planner-p6-25yr', {
        systemPrompt: 'new prompt',
        authoredBy: 'ayham',
      });

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'prior-id', isCurrent: false }),
      );
      expect(next.version).toBe(4);
      expect(next.isCurrent).toBe(true);
      expect(next.systemPrompt).toBe('new prompt');
      // Unspecified fields carry forward from the prior row.
      expect(next.layer).toBe(Layer.PLANNING);
      expect(next.modelTier).toBe('claude-sonnet');
    });
  });
});
