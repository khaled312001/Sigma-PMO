import { ClashDetail } from './clash-ingestion.service';
import { ClashPdfService } from './clash-pdf.service';

/**
 * `ClashPdfService` — proves the clash-detail PDF (Req R4) renders to a
 * non-empty `%PDF` buffer with every acceptance field populated, and that it
 * stays robust when the optional columns are all null.
 */
describe('ClashPdfService', () => {
  const service = new ClashPdfService();

  /** A clash with all R4 fields populated + a chosen option. */
  function fullDetail(): ClashDetail {
    return {
      id: 'clash-1',
      createdAt: new Date('2026-06-20T08:00:00Z'),
      projectBusinessKey: 'P-1000',
      sourceFileId: 'sf-1',
      clashRef: 'C-001',
      disciplinesInvolved: ['mechanical', 'structural'],
      severity: 'critical',
      description: 'Duct penetrates beam at gridline C-4.',
      proposedOptions: [
        { label: 'A — reroute duct', timeImpactDays: 2, costImpactAED: 15000, scopeImpact: 'MEP reroute' },
        { label: 'B — sleeve beam', timeImpactDays: 0, costImpactAED: null, scopeImpact: 'structural sleeve' },
      ],
      chosenOptionIndex: 0,
      decidedBy: 'Eng. Ayham',
      decidedAt: new Date('2026-06-21T10:00:00Z'),
      elementGuidA: '2O2Fr$t4X7Zf8NOew3FLOH',
      elementGuidB: '3aB7Xk1m9pQrS5tUvWxYz0',
      locationX: 12340.5,
      locationY: -8800,
      locationZ: 12300,
      gridLocation: 'C-4 / +12.30',
      penetrationMm: 72.5,
      snapshotImagePath: 'clashes/P-1000/C-001.png',
      viewUrn: 'urn:adsk.objects:os.object:bucket/model.ifc',
      viewState: { modelAId: 'rec-A', modelBId: 'rec-B', extentConfidence: 0.9, kind: 'hard' },
      linkedActivityBusinessKey: 'ACT-100',
      responsibleParty: 'mechanical discipline',
      detail: {
        clashRef: 'C-001',
        severity: 'critical',
        disciplinesInvolved: ['mechanical', 'structural'],
        modelA: 'rec-A',
        modelB: 'rec-B',
        elementGuidA: '2O2Fr$t4X7Zf8NOew3FLOH',
        elementGuidB: '3aB7Xk1m9pQrS5tUvWxYz0',
        location: { x: 12340.5, y: -8800, z: 12300 },
        gridLocation: 'C-4 / +12.30',
        penetrationMm: 72.5,
        snapshotImagePath: 'clashes/P-1000/C-001.png',
        viewUrn: 'urn:adsk.objects:os.object:bucket/model.ifc',
        viewState: { modelAId: 'rec-A', modelBId: 'rec-B' },
        linkedActivityKeys: ['ACT-100'],
        responsibleParty: 'mechanical discipline',
      },
    } as unknown as ClashDetail;
  }

  it('renders a non-empty %PDF buffer for a fully-populated clash', async () => {
    const buf = await service.render(fullDetail());
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(800);
    // PDF magic header — proves a real PDF, not an empty/placeholder buffer.
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('still renders a %PDF buffer when every optional column is null', async () => {
    const sparse = {
      id: 'clash-2',
      projectBusinessKey: 'P-2000',
      clashRef: 'C-XYZ',
      description: '',
      proposedOptions: null,
      chosenOptionIndex: null,
      decidedBy: null,
      decidedAt: null,
      viewState: null,
      detail: {
        clashRef: 'C-XYZ',
        severity: 'minor',
        disciplinesInvolved: [],
        modelA: null,
        modelB: null,
        elementGuidA: null,
        elementGuidB: null,
        location: null,
        gridLocation: null,
        penetrationMm: null,
        snapshotImagePath: null,
        viewUrn: null,
        viewState: null,
        linkedActivityKeys: [],
        responsibleParty: null,
      },
    } as unknown as ClashDetail;

    const buf = await service.render(sparse);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.byteLength).toBeGreaterThan(800);
  });
});
