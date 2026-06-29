import { ClashDetail, ClashDetectOutcome, ClashIngestionService } from './clash-ingestion.service';
import { ClashPdfService } from './clash-pdf.service';
import { ClashesController } from './clashes.controller';

/** GET /clashes/:id must return the typed detail payload (Req 2 + R4). */
describe('ClashesController', () => {
  const pdf = { render: jest.fn(async () => Buffer.from('%PDF-1.7 test')) } as unknown as ClashPdfService;

  it('GET /clashes/:id returns the first-class detail fields incl. modelA/modelB', async () => {
    const detail = {
      id: 'clash-1',
      projectBusinessKey: 'P-1000',
      detail: {
        clashRef: 'C-001',
        severity: 'critical',
        disciplinesInvolved: ['mechanical', 'structural'],
        modelA: 'rec-A',
        modelB: 'rec-B',
        elementGuidA: 'GUID-A',
        elementGuidB: 'GUID-B',
        location: { x: 10, y: 20, z: 30 },
        gridLocation: 'C-4',
        penetrationMm: 72.5,
        snapshotImagePath: null,
        viewUrn: null,
        viewState: null,
        linkedActivityKeys: ['A-CRIT'],
        responsibleParty: 'mechanical discipline',
      },
    } as unknown as ClashDetail;

    const ingestion = {
      getDetailById: jest.fn(async () => detail),
    } as unknown as ClashIngestionService;
    const controller = new ClashesController(ingestion, pdf);

    const res = await controller.get('clash-1');
    expect(ingestion.getDetailById).toHaveBeenCalledWith('clash-1');
    expect(res.detail.elementGuidA).toBe('GUID-A');
    expect(res.detail.modelA).toBe('rec-A');
    expect(res.detail.modelB).toBe('rec-B');
    expect(res.detail.location).toEqual({ x: 10, y: 20, z: 30 });
    expect(res.detail.penetrationMm).toBeCloseTo(72.5);
    expect(res.detail.linkedActivityKeys).toEqual(['A-CRIT']);
    expect(res.detail.responsibleParty).toBe('mechanical discipline');
  });

  it('GET /clashes/:id/pdf streams a PDF buffer with clash-<ref> filename', async () => {
    const detail = {
      id: 'clash-2',
      clashRef: 'C-009',
      detail: { clashRef: 'C-009' },
    } as unknown as ClashDetail;
    const ingestion = {
      getDetailById: jest.fn(async () => detail),
    } as unknown as ClashIngestionService;
    const controller = new ClashesController(ingestion, pdf);

    // Chainable Express Response double.
    const headers: Record<string, string> = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn((k: string, v: string) => {
        headers[k] = v;
        return res;
      }),
      send: jest.fn().mockReturnThis(),
    } as unknown as Parameters<ClashesController['renderPdf']>[1];

    await controller.renderPdf('clash-2', res);

    expect(ingestion.getDetailById).toHaveBeenCalledWith('clash-2');
    expect(pdf.render).toHaveBeenCalledWith(detail);
    expect(headers['Content-Type']).toBe('application/pdf');
    expect(headers['Content-Disposition']).toContain('clash-C-009.pdf');
    expect((res.send as jest.Mock).mock.calls[0][0]).toBeInstanceOf(Buffer);
  });

  it('POST /clashes/detect delegates to detectFromModels and returns clashesPersisted', async () => {
    const outcome = { clashesPersisted: 3, stats: { hardClashes: 2 } } as unknown as ClashDetectOutcome;
    const ingestion = {
      detectFromModels: jest.fn(async () => outcome),
    } as unknown as ClashIngestionService;
    const controller = new ClashesController(ingestion, pdf);
    const res = await controller.detect({ projectKey: 'P-1', modelAId: 'rec-A', modelBId: 'rec-B' });
    expect(ingestion.detectFromModels).toHaveBeenCalledWith({
      projectBusinessKey: 'P-1',
      modelAId: 'rec-A',
      modelBId: 'rec-B',
      clearanceMm: undefined,
    });
    expect(res.clashesPersisted).toBe(3);
  });
});
