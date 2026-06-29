import { ClashDetail, ClashDetectOutcome, ClashIngestionService } from './clash-ingestion.service';
import { ClashesController } from './clashes.controller';

/** GET /clashes/:id must return the typed detail payload (Req 2). */
describe('ClashesController', () => {
  it('GET /clashes/:id returns the first-class detail fields', async () => {
    const detail = {
      id: 'clash-1',
      projectBusinessKey: 'P-1000',
      detail: {
        clashRef: 'C-001',
        severity: 'critical',
        disciplinesInvolved: ['mechanical', 'structural'],
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
    const controller = new ClashesController(ingestion);

    const res = await controller.get('clash-1');
    expect(ingestion.getDetailById).toHaveBeenCalledWith('clash-1');
    expect(res.detail.elementGuidA).toBe('GUID-A');
    expect(res.detail.location).toEqual({ x: 10, y: 20, z: 30 });
    expect(res.detail.penetrationMm).toBeCloseTo(72.5);
    expect(res.detail.linkedActivityKeys).toEqual(['A-CRIT']);
    expect(res.detail.responsibleParty).toBe('mechanical discipline');
  });

  it('POST /clashes/detect delegates to detectFromModels and returns clashesPersisted', async () => {
    const outcome = { clashesPersisted: 3, stats: { hardClashes: 2 } } as unknown as ClashDetectOutcome;
    const ingestion = {
      detectFromModels: jest.fn(async () => outcome),
    } as unknown as ClashIngestionService;
    const controller = new ClashesController(ingestion);
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
