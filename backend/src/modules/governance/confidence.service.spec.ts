import { SourceType } from '../../common/enums';
import { RawDataset } from '../ingestion/parsers/parser.interface';
import { ConfidenceService } from './confidence.service';

function dataset(over: Partial<RawDataset> = {}): RawDataset {
  return {
    sourceType: SourceType.P6_XML,
    parser: 'p6_xml',
    projects: [],
    activities: [],
    resources: [],
    reports: [],
    assignments: [],
    meta: {},
    ...over,
  };
}

describe('ConfidenceService.compute', () => {
  // Service is invoked with no repository — `compute` is pure and doesn't touch it.
  const service = new ConfidenceService(undefined as never);

  it('returns 1.0 across the board for a perfect P6 XML dataset', () => {
    const ds = dataset({
      projects: [{
        businessKey: 'P-1', name: 'X', plannedStart: '2026-01-01',
        plannedFinish: '2026-12-31', dataDate: '2026-05-15',
      }],
    });
    const score = service.compute(ds, { passed: true, errorCount: 0, warningCount: 0, issues: [] });
    expect(score.completeness).toBeCloseTo(1);
    expect(score.consistency).toBeCloseTo(1);
    expect(score.sourceReliability).toBeCloseTo(1);
    expect(score.overall).toBeCloseTo(1);
  });

  it('penalises validation issues on consistency', () => {
    const ds = dataset({
      projects: [{ businessKey: 'P-1', name: 'X', plannedStart: '2026-01-01', plannedFinish: '2026-12-31', dataDate: '2026-05-15' }],
    });
    const score = service.compute(ds, { passed: false, errorCount: 2, warningCount: 3, issues: [] });
    // 1 - (2*0.1 + 3*0.02) = 1 - 0.26 = 0.74
    expect(score.consistency).toBeCloseTo(0.74);
  });

  it('weights CSV source lower than P6 XML', () => {
    const ds = dataset({
      sourceType: SourceType.CSV,
      projects: [{ businessKey: 'P-1', name: 'X', plannedStart: '2026-01-01', plannedFinish: '2026-12-31', dataDate: '2026-05-15' }],
    });
    const score = service.compute(ds, { passed: true, errorCount: 0, warningCount: 0, issues: [] });
    expect(score.sourceReliability).toBeCloseTo(0.7);
  });

  it('completeness drops when required fields are missing', () => {
    const ds = dataset({
      projects: [{ businessKey: 'P-1', name: 'X', plannedStart: null, plannedFinish: null, dataDate: null }],
    });
    const score = service.compute(ds, { passed: true, errorCount: 0, warningCount: 0, issues: [] });
    // 2 of 5 required fields populated
    expect(score.completeness).toBeCloseTo(0.4);
  });
});
