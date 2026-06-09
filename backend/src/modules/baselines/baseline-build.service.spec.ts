import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { BaselineBuildJob } from '../canonical/entities';
import {
  AWAITING_ENABLEMENT_STATUS,
  BaselineBuildService,
  COMPUTER_USE_GATED_REASON,
  DEFAULT_PLANNER_PERSONA_SLUG,
} from './baseline-build.service';

function makeRepo(): {
  findOne: jest.Mock;
  find: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
} {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(async (e) => ({ id: 'generated-id', createdAt: new Date(), ...e })),
    create: jest.fn((e) => ({ ...e })),
  };
}

describe('BaselineBuildService', () => {
  let repo: ReturnType<typeof makeRepo>;
  let service: BaselineBuildService;

  beforeEach(() => {
    repo = makeRepo();
    service = new BaselineBuildService(repo as unknown as Repository<BaselineBuildJob>);
  });

  describe('submitJob', () => {
    it('parks the job in awaiting-enablement with the ADR-0011 gated reason', async () => {
      const job = await service.submitJob('PROJ-A', ['file-1', 'file-2'], 'planner-p6-25yr');

      expect(job.status).toBe(AWAITING_ENABLEMENT_STATUS);
      expect(job.status).toBe('awaiting-enablement');
      expect(job.failureReason).toBe(COMPUTER_USE_GATED_REASON);
      expect(job.failureReason).toContain('ADR-0011');
      expect(job.failureReason).toContain('open question 6');
      expect(job.projectBusinessKey).toBe('PROJ-A');
      expect(job.drawingsSourceFileIds).toEqual(['file-1', 'file-2']);
      expect(job.personaSlug).toBe('planner-p6-25yr');
      expect(job.progressPercent).toBe(0);
      expect(job.startedAt).toBeNull();
      expect(job.completedAt).toBeNull();
      expect(job.outputXerSourceFileId).toBeNull();
      expect(job.operatorNotes).toBeNull();
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('defaults personaSlug to planner-p6-25yr when omitted', async () => {
      const job = await service.submitJob('PROJ-B', []);
      expect(job.personaSlug).toBe(DEFAULT_PLANNER_PERSONA_SLUG);
      expect(job.personaSlug).toBe('planner-p6-25yr');
    });

    it('defaults personaSlug when an empty string is passed', async () => {
      const job = await service.submitJob('PROJ-C', ['file-1'], '');
      expect(job.personaSlug).toBe(DEFAULT_PLANNER_PERSONA_SLUG);
    });

    it('persists the drawings array verbatim (empty allowed at the stub level)', async () => {
      const job = await service.submitJob('PROJ-D', []);
      expect(job.drawingsSourceFileIds).toEqual([]);
    });

    it('rejects a missing projectKey', async () => {
      await expect(service.submitJob('', ['file-1'])).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects a non-array drawingsSourceFileIds', async () => {
      await expect(
        service.submitJob('PROJ-E', 'not-an-array' as unknown as string[]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('listJobs', () => {
    it('returns rows for the project ordered newest-first', async () => {
      const rows = [{ id: 'j2' }, { id: 'j1' }] as BaselineBuildJob[];
      repo.find.mockResolvedValueOnce(rows);

      const out = await service.listJobs('PROJ-A');

      expect(out).toBe(rows);
      expect(repo.find).toHaveBeenCalledWith({
        where: { projectBusinessKey: 'PROJ-A' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('getJob', () => {
    it('returns the row when found', async () => {
      const row = { id: 'job-1' } as BaselineBuildJob;
      repo.findOne.mockResolvedValueOnce(row);

      const out = await service.getJob('job-1');

      expect(out).toBe(row);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'job-1' } });
    });

    it('throws NotFoundException when missing', async () => {
      repo.findOne.mockResolvedValueOnce(null);
      await expect(service.getJob('missing-id')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
