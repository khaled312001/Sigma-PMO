import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { DrawingPackage, SourceFile } from '../canonical/entities';
import { StorageService } from '../ingestion/storage/storage.service';
import { DrawingsService } from './drawings.service';

describe('DrawingsService — CAD (.dwg/.dxf) intake (Mr. Ayham acceptance 2026-06-28)', () => {
  function build() {
    const packages = {
      create: jest.fn((row: Partial<DrawingPackage>) => ({ id: 'dp-1', ...row } as DrawingPackage)),
      save: jest.fn(async (row: DrawingPackage) => row),
    } as unknown as Repository<DrawingPackage>;

    const sourceFiles = {
      create: jest.fn((row: Partial<SourceFile>) => ({ id: 'sf-1', ...row } as SourceFile)),
      save: jest.fn(async (row: SourceFile) => row),
    } as unknown as Repository<SourceFile>;

    const storage = {
      sha256: jest.fn(() => 'cafebabe'),
      archive: jest.fn(async () => '/archive/cafebabe__plan.dwg'),
    } as unknown as StorageService;

    return { svc: new DrawingsService(packages, sourceFiles, storage), packages, sourceFiles, storage };
  }

  it('accepts and archives a .dwg upload with an honest CAD extractionNote', async () => {
    const { svc, storage } = build();
    const buffer = Buffer.from('AC1027-binary-dwg-bytes');
    const row = await svc.ingestPdf({ projectKey: 'P-1000', filename: 'plan.dwg', buffer, uploadedBy: 'tester' });

    expect(storage.archive).toHaveBeenCalledWith('plan.dwg', buffer, 'cafebabe');
    expect(row.format).toBe('dwg');
    expect(row.sourceFileId).toBe('sf-1');
    const note = (row.summary as Record<string, unknown>).extractionNote as string;
    expect(note).toContain('Autodesk APS');
    // We do not pretend to parse DWG geometry.
    expect((row.summary as Record<string, unknown>).pageCount).toBe(0);
  });

  it('accepts a .dxf upload (format dxf)', async () => {
    const { svc } = build();
    const row = await svc.ingestPdf({ projectKey: 'P-1000', filename: 'detail.dxf', buffer: Buffer.from('0\nSECTION'), uploadedBy: null });
    expect(row.format).toBe('dxf');
  });

  it('rejects an unsupported extension', async () => {
    const { svc } = build();
    await expect(
      svc.ingestPdf({ projectKey: 'P-1000', filename: 'model.rvt', buffer: Buffer.from('x'), uploadedBy: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('still rejects a .pdf without the %PDF header', async () => {
    const { svc } = build();
    await expect(
      svc.ingestPdf({ projectKey: 'P-1000', filename: 'fake.pdf', buffer: Buffer.from('not a pdf'), uploadedBy: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
