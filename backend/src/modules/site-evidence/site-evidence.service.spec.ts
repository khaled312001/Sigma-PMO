import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { SiteEvidence } from '../canonical/entities/site-evidence.entity';
import { StorageService } from '../ingestion/storage/storage.service';
import { SafetyService } from '../safety/safety.service';
import { QualityService } from '../quality/quality.service';
import { SiteEvidenceService } from './site-evidence.service';

describe('SiteEvidenceService — smart-glasses / site-evidence capture', () => {
  const png = Buffer.from('hello-bytes');
  const contentBase64 = png.toString('base64');

  function build() {
    const saved: SiteEvidence[] = [];
    const repo = {
      create: jest.fn((row: Partial<SiteEvidence>) => ({ id: 'se-1', ...row } as SiteEvidence)),
      save: jest.fn(async (row: SiteEvidence) => {
        saved.push(row);
        return row;
      }),
      find: jest.fn(async () => saved),
      findOne: jest.fn(async () => saved[0] ?? null),
    } as unknown as Repository<SiteEvidence>;

    const storage = {
      sha256: jest.fn(() => 'deadbeef'),
      archive: jest.fn(async () => '/archive/deadbeef__shot.png'),
    } as unknown as StorageService;

    const safety = { createRecord: jest.fn(async () => ({ id: 'saf-1' })) } as unknown as SafetyService;
    const quality = { createRecord: jest.fn(async () => ({ id: 'qual-1' })) } as unknown as QualityService;

    return {
      svc: new SiteEvidenceService(repo, storage, safety, quality),
      repo, storage, safety, quality,
    };
  }

  const base = {
    projectBusinessKey: 'P-1000',
    mediaKind: 'photo',
    filename: 'shot.png',
    mimeType: 'image/png',
    contentBase64,
  };

  it('archives the media and derives reportDate from capturedAt', async () => {
    const { svc, storage } = build();
    const row = await svc.capture({ ...base, capturedAt: '2026-06-28T09:15:00Z', deviceType: 'smart_glasses' });
    expect(storage.archive).toHaveBeenCalledWith('shot.png', expect.any(Buffer), 'deadbeef');
    expect(row.sha256).toBe('deadbeef');
    expect(row.storedPath).toBe('/archive/deadbeef__shot.png');
    expect(row.bytes).toBe(png.length);
    expect(row.reportDate).toBe('2026-06-28');
    expect(row.deviceType).toBe('smart_glasses');
  });

  it('rejects an invalid mediaKind', async () => {
    const { svc } = build();
    await expect(svc.capture({ ...base, mediaKind: 'hologram' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('raises a safety finding and links it back, with media in details.evidence', async () => {
    const { svc, safety } = build();
    const row = await svc.capture({ ...base, findingType: 'safety', activityKey: 'A-7' });
    expect(safety.createRecord).toHaveBeenCalledTimes(1);
    const arg = (safety.createRecord as jest.Mock).mock.calls[0][0];
    expect(arg.recordType).toBe('incident');
    expect(arg.affectedActivityKeys).toEqual(['A-7']);
    expect(arg.details.evidence).toMatchObject({ sha256: 'deadbeef', storedPath: '/archive/deadbeef__shot.png' });
    expect(row.linkedSafetyRecordId).toBe('saf-1');
    expect(row.linkedQualityRecordId).toBeNull();
  });

  it('raises a quality finding (recordType ncr) when findingType=quality', async () => {
    const { svc, quality } = build();
    const row = await svc.capture({ ...base, findingType: 'quality' });
    expect(quality.createRecord).toHaveBeenCalledTimes(1);
    expect((quality.createRecord as jest.Mock).mock.calls[0][0].recordType).toBe('ncr');
    expect(row.linkedQualityRecordId).toBe('qual-1');
  });

  it('does not raise a finding when findingType is absent', async () => {
    const { svc, safety, quality } = build();
    const row = await svc.capture({ ...base });
    expect(safety.createRecord).not.toHaveBeenCalled();
    expect(quality.createRecord).not.toHaveBeenCalled();
    expect(row.findingType).toBeNull();
  });

  it('list filters by reportDate when a date is supplied', async () => {
    const { svc, repo } = build();
    await svc.list('P-1000', '2026-06-28');
    expect((repo.find as jest.Mock).mock.calls[0][0].where).toMatchObject({
      projectBusinessKey: 'P-1000', reportDate: '2026-06-28',
    });
  });
});
