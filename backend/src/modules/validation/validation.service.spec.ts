import { SourceType } from '../../common/enums';
import { RawDataset } from '../ingestion/parsers/parser.interface';
import { ValidationService } from './validation.service';

function makeDataset(overrides: Partial<RawDataset> = {}): RawDataset {
  return {
    sourceType: SourceType.CSV,
    parser: 'test',
    projects: [],
    activities: [],
    resources: [],
    reports: [],
    assignments: [],
    meta: {},
    ...overrides,
  };
}

describe('ValidationService', () => {
  const validator = new ValidationService();

  it('passes on a coherent self-contained dataset', () => {
    const report = validator.validate(
      makeDataset({
        projects: [{ businessKey: 'P-1', name: 'A project' }],
        activities: [{ businessKey: 'A-1', projectKey: 'P-1', name: 'Task' }],
      }),
    );
    expect(report.passed).toBe(true);
    expect(report.errorCount).toBe(0);
  });

  it('flags an orphan activity inside a self-contained dataset', () => {
    const report = validator.validate(
      makeDataset({
        projects: [{ businessKey: 'P-1', name: 'A project' }],
        activities: [{ businessKey: 'A-1', projectKey: 'P-MISSING', name: 'Task' }],
      }),
    );
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.code === 'ORPHAN')).toBe(true);
  });

  it('downgrades unresolved parent to a warning when parent collection is empty (partial source)', () => {
    const report = validator.validate(
      makeDataset({
        activities: [{ businessKey: 'A-1', projectKey: 'P-1', name: 'Task' }],
      }),
    );
    expect(report.passed).toBe(true);
    expect(report.warningCount).toBeGreaterThan(0);
    expect(report.issues.some((i) => i.code === 'UNRESOLVED_PARENT')).toBe(true);
  });

  it('detects duplicate business keys', () => {
    const report = validator.validate(
      makeDataset({
        projects: [
          { businessKey: 'P-1', name: 'A' },
          { businessKey: 'P-1', name: 'A again' },
        ],
      }),
    );
    expect(report.issues.some((i) => i.code === 'DUPLICATE_KEY')).toBe(true);
  });

  it('warns when planned finish precedes planned start', () => {
    const report = validator.validate(
      makeDataset({
        projects: [{
          businessKey: 'P-1',
          name: 'Reverse-dated',
          plannedStart: '2026-06-01',
          plannedFinish: '2026-05-01',
        }],
      }),
    );
    expect(report.issues.some((i) => i.code === 'DATE_ORDER')).toBe(true);
  });
});
