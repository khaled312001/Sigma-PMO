import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ObjectLiteral, Repository } from 'typeorm';

import { SourceFile } from '../canonical/entities';
import { ClaudeService } from '../claude/claude.service';
import { LetterDrafterService } from '../letters/letter-drafter.service';
import { Letter } from '../letters/letter.entity';
import { SourcesService } from '../sources/sources.service';
import { StorageService } from '../ingestion/storage/storage.service';
import { OrgChartComplianceService } from './org-chart-compliance.service';
import {
  OrgChartFinding,
  OrgChartReview,
} from './org-chart-review.entity';

type RepoMock<T extends ObjectLiteral> = {
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
} & Partial<Repository<T>>;

function repoMock<T extends ObjectLiteral>(): RepoMock<T> {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(async (entity) => ({ id: 'review-1', ...entity })),
    create: jest.fn((entity) => entity),
  } as unknown as RepoMock<T>;
}

const FINDINGS_BLOCK = `
<findings>
[
  {
    "role": "qa-qc-manager",
    "label": "QA/QC Manager",
    "processGroup": "Executing",
    "severity": "missing-role",
    "issue": "No QA/QC Manager named in the chart.",
    "recommendation": "Appoint a qualified QA/QC Manager before mobilisation.",
    "citationIds": ["pmbok-7"]
  },
  {
    "role": "reporting-line-pm",
    "label": "Reporting line: PM",
    "processGroup": "Monitoring & Controlling",
    "severity": "unclear-line",
    "issue": "The Project Manager has two reporting lines.",
    "recommendation": "Consolidate to a single accountability line.",
    "citationIds": ["pmbok-7"]
  }
]
</findings>
[SOURCE: pmbok-7]
`;

// Build a tiny valid XLSX in memory so we can pass it through the parser end-to-end.
async function makeOrgChartXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Org');
  ws.addRow(['Role', 'Holder', 'ReportsTo', 'Discipline']);
  ws.addRow(['Project Manager', 'Ali Hassan', 'Owner', 'Management']);
  ws.addRow(['Site Manager', 'Maha Saleh', 'Project Manager', 'Execution']);
  ws.addRow(['HSE Officer', 'Tarek Younis', 'Site Manager', 'Safety']);
  const arr = (await wb.xlsx.writeBuffer()) as ArrayBuffer | Uint8Array;
  return Buffer.from(arr as ArrayBuffer);
}

describe('OrgChartComplianceService', () => {
  let reviews: RepoMock<OrgChartReview>;
  let sourceFiles: RepoMock<SourceFile>;
  let claude: { isEnabled: jest.Mock; callPersona: jest.Mock };
  let sources: { findByExternalId: jest.Mock };
  let letterDrafter: { draftComplianceLetter: jest.Mock };
  let storage: { sha256: jest.Mock; archive: jest.Mock };
  let svc: OrgChartComplianceService;

  beforeEach(() => {
    reviews = repoMock<OrgChartReview>();
    sourceFiles = repoMock<SourceFile>();
    sourceFiles.save = jest.fn(async (entity) => ({ id: 'src-1', ...entity }));

    claude = {
      isEnabled: jest.fn(() => true),
      callPersona: jest.fn(async () => ({
        content: FINDINGS_BLOCK,
        citations: ['pmbok-7'],
        tokensIn: 100,
        tokensOut: 200,
        cached: false,
        personaSlug: 'pmi-orgchart-analyst',
        personaVersion: 1,
        model: 'claude-sonnet-4-5',
        stopReason: 'end_turn',
      })),
    };
    sources = {
      findByExternalId: jest.fn(async (id: string) => {
        if (id === 'pmbok-7') return { externalId: id };
        throw new Error('not found');
      }),
    };
    letterDrafter = {
      draftComplianceLetter: jest.fn(async () => ({ id: 'letter-1' } as Letter)),
    };
    storage = {
      sha256: jest.fn(() => 'abc123'),
      archive: jest.fn(async () => '/archive/abc123__file.xlsx'),
    };

    svc = new OrgChartComplianceService(
      reviews as unknown as Repository<OrgChartReview>,
      sourceFiles as unknown as Repository<SourceFile>,
      claude as unknown as ClaudeService,
      sources as unknown as SourcesService,
      letterDrafter as unknown as LetterDrafterService,
      storage as unknown as StorageService,
    );
  });

  describe('ingestAndReview', () => {
    it('archives the file, parses, runs the persona, persists a review', async () => {
      const buffer = await makeOrgChartXlsx();
      const review = await svc.ingestAndReview({
        projectKey: 'P-2000',
        filename: 'org-chart.xlsx',
        buffer,
      });

      expect(storage.archive).toHaveBeenCalledTimes(1);
      expect(sourceFiles.save).toHaveBeenCalledTimes(1);
      expect(claude.callPersona).toHaveBeenCalledWith(
        'pmi-orgchart-analyst',
        expect.stringContaining('PMBOK'),
        expect.objectContaining({ context: expect.stringContaining('Project Manager') }),
      );
      expect(reviews.save).toHaveBeenCalledTimes(1);
      const saved = reviews.save.mock.calls[0][0] as OrgChartReview;
      expect(saved.projectBusinessKey).toBe('P-2000');
      expect(saved.findings).toHaveLength(2);
      expect(saved.citations).toEqual(['pmbok-7']);
      expect(saved.status).toBe('pending-review');
      expect(review).toMatchObject({ projectBusinessKey: 'P-2000' });
    });

    it('rejects an empty buffer', async () => {
      await expect(
        svc.ingestAndReview({ projectKey: 'P', filename: 'x', buffer: Buffer.alloc(0) }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when persona returns no parseable findings', async () => {
      claude.callPersona.mockResolvedValueOnce({
        content: '<findings>not-json</findings>',
        citations: ['pmbok-7'],
        tokensIn: 0,
        tokensOut: 0,
        cached: false,
        personaSlug: 'pmi-orgchart-analyst',
        personaVersion: 1,
        model: 'claude-sonnet-4-5',
        stopReason: 'end_turn',
      });
      await expect(
        svc.ingestAndReview({
          projectKey: 'P',
          filename: 'x.xlsx',
          buffer: await makeOrgChartXlsx(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when persona response has no valid Source citations', async () => {
      claude.callPersona.mockResolvedValueOnce({
        content: FINDINGS_BLOCK,
        citations: ['fake-source'],
        tokensIn: 0,
        tokensOut: 0,
        cached: false,
        personaSlug: 'pmi-orgchart-analyst',
        personaVersion: 1,
        model: 'claude-sonnet-4-5',
        stopReason: 'end_turn',
      });
      sources.findByExternalId.mockRejectedValue(new Error('not found'));
      await expect(
        svc.ingestAndReview({
          projectKey: 'P',
          filename: 'x.xlsx',
          buffer: await makeOrgChartXlsx(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('uses deterministic fallback when ClaudeService is disabled', async () => {
      claude.isEnabled.mockReturnValue(false);
      const review = await svc.ingestAndReview({
        projectKey: 'P-2000',
        filename: 'org-chart.xlsx',
        buffer: await makeOrgChartXlsx(),
      });
      expect(claude.callPersona).not.toHaveBeenCalled();
      expect(reviews.save).toHaveBeenCalledTimes(1);
      const saved = reviews.save.mock.calls[0][0] as OrgChartReview;
      expect(saved.findings).toHaveLength(1);
      expect(saved.findings[0].citationIds).toEqual(['pmbok-7']);
      expect(saved.citations).toEqual(['pmbok-7']);
      void review;
    });
  });

  describe('draftComplianceLetter', () => {
    const findings: OrgChartFinding[] = [
      {
        role: 'qa-qc-manager',
        label: 'QA/QC Manager',
        processGroup: 'Executing',
        severity: 'missing-role',
        issue: 'No QA/QC Manager named.',
        recommendation: 'Appoint one.',
        citationIds: ['pmbok-7'],
      },
    ];

    it('cascades findings into a FIDIC compliance letter draft', async () => {
      reviews.findOne.mockResolvedValueOnce({
        id: 'r-1',
        projectBusinessKey: 'P-1',
        findings,
        complianceLetterId: null,
        status: 'pending-review',
        citations: ['pmbok-7'],
      });

      const letter = await svc.draftComplianceLetter('r-1');

      expect(letterDrafter.draftComplianceLetter).toHaveBeenCalledWith(
        'P-1',
        'pmi.org-chart-non-compliance',
        expect.objectContaining({
          triggerCode: 'pmi.org-chart-non-compliance',
          narrative: expect.stringContaining('QA/QC Manager'),
          facts: expect.objectContaining({ orgChartReviewId: 'r-1', findingCount: 1 }),
        }),
      );
      expect(reviews.save).toHaveBeenCalledWith(
        expect.objectContaining({ complianceLetterId: 'letter-1', status: 'letter-drafted' }),
      );
      expect(letter.id).toBe('letter-1');
    });

    it('refuses to draft twice for the same review', async () => {
      reviews.findOne.mockResolvedValueOnce({
        id: 'r-1',
        projectBusinessKey: 'P-1',
        findings,
        complianceLetterId: 'letter-existing',
        status: 'letter-drafted',
        citations: ['pmbok-7'],
      });
      await expect(svc.draftComplianceLetter('r-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(letterDrafter.draftComplianceLetter).not.toHaveBeenCalled();
    });

    it('refuses to draft on an empty findings array', async () => {
      reviews.findOne.mockResolvedValueOnce({
        id: 'r-1',
        projectBusinessKey: 'P-1',
        findings: [],
        complianceLetterId: null,
        status: 'compliant',
        citations: [],
      });
      await expect(svc.draftComplianceLetter('r-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to draft when all findings are over-staffed', async () => {
      reviews.findOne.mockResolvedValueOnce({
        id: 'r-1',
        projectBusinessKey: 'P-1',
        findings: [{ ...findings[0], severity: 'over-staffed' }],
        complianceLetterId: null,
        status: 'compliant',
        citations: ['pmbok-7'],
      });
      await expect(svc.draftComplianceLetter('r-1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
