import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { Alert, Project, RuleEvaluation } from '../canonical/entities';
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

    // The project the safety alert pins to (current, version-pinned id).
    const projects = {
      findOne: jest.fn(async () => ({ id: 'proj-uuid-1', businessKey: 'P-1000', isCurrent: true })),
    } as unknown as Repository<Project>;

    const alertRows: Alert[] = [];
    const alerts = {
      create: jest.fn((row: Partial<Alert>) => ({ id: 'alert-1', ...row } as Alert)),
      save: jest.fn(async (row: Alert) => { alertRows.push(row); return row; }),
    } as unknown as Repository<Alert>;

    const evalRows: RuleEvaluation[] = [];
    const evaluations = {
      create: jest.fn((row: Partial<RuleEvaluation>) => ({ id: 'eval-1', ...row } as RuleEvaluation)),
      save: jest.fn(async (row: RuleEvaluation) => { evalRows.push(row); return row; }),
    } as unknown as Repository<RuleEvaluation>;

    const storage = {
      sha256: jest.fn(() => 'deadbeef'),
      archive: jest.fn(async () => '/archive/deadbeef__shot.png'),
    } as unknown as StorageService;

    const safety = { createRecord: jest.fn(async () => ({ id: 'saf-1' })) } as unknown as SafetyService;
    const quality = { createRecord: jest.fn(async () => ({ id: 'qual-1' })) } as unknown as QualityService;

    return {
      svc: new SiteEvidenceService(repo, projects, alerts, evaluations, storage, safety, quality),
      repo, projects, alerts, evaluations, storage, safety, quality, alertRows, evalRows,
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

  it('raises a governance alert (awaiting human approval) from a safety capture', async () => {
    const { svc, alerts, evaluations, alertRows, evalRows } = build();
    await svc.capture({ ...base, findingType: 'safety', activityKey: 'A-7', locationLabel: 'Level 3, Grid C-4' });

    // A synthetic RuleEvaluation supplies the alert provenance.
    expect(evaluations.save).toHaveBeenCalledTimes(1);
    expect(evalRows[0]).toMatchObject({ projectId: 'proj-uuid-1', alertCount: 1 });

    // The alert is pinned to the project and points back at the capture + safety record.
    expect(alerts.save).toHaveBeenCalledTimes(1);
    const alert = alertRows[0];
    expect(alert.code).toBe('SITE_SAFETY_OBSERVATION');
    expect(alert.projectId).toBe('proj-uuid-1');
    expect(alert.ruleEvaluationId).toBe('eval-1');
    expect(alert.sourceFileId).toBe('se-1');
    expect(alert.context).toMatchObject({
      siteEvidenceId: 'se-1', safetyRecordId: 'saf-1', sha256: 'deadbeef', requiresHumanApproval: true,
    });
  });

  it('does NOT raise an alert when the safety capture has no current project', async () => {
    const { svc, projects, alerts } = build();
    (projects.findOne as jest.Mock).mockResolvedValueOnce(null);
    const row = await svc.capture({ ...base, findingType: 'safety' });
    // Evidence + safety record still saved; only the alert is skipped.
    expect(row.linkedSafetyRecordId).toBe('saf-1');
    expect(alerts.save).not.toHaveBeenCalled();
  });

  it('raises a quality finding (recordType ncr) when findingType=quality — no alert', async () => {
    const { svc, quality, alerts } = build();
    const row = await svc.capture({ ...base, findingType: 'quality' });
    expect(quality.createRecord).toHaveBeenCalledTimes(1);
    expect((quality.createRecord as jest.Mock).mock.calls[0][0].recordType).toBe('ncr');
    expect(row.linkedQualityRecordId).toBe('qual-1');
    expect(alerts.save).not.toHaveBeenCalled();
  });

  it('does not raise a finding when findingType is absent', async () => {
    const { svc, safety, quality, alerts } = build();
    const row = await svc.capture({ ...base });
    expect(safety.createRecord).not.toHaveBeenCalled();
    expect(quality.createRecord).not.toHaveBeenCalled();
    expect(alerts.save).not.toHaveBeenCalled();
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
