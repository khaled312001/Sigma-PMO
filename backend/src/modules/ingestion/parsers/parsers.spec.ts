import { CsvParser } from './csv.parser';
import { MSProjectXmlParser } from './msproject-xml.parser';
import { P6XerParser } from './p6-xer.parser';
import { P6XmlParser } from './p6-xml.parser';
import { ParserRegistry } from './parser.registry';
import { ExcelParser } from './excel.parser';

describe('CsvParser', () => {
  const parser = new CsvParser();

  it('routes activities.csv to the activities bucket', () => {
    const csv = Buffer.from('businessKey,projectKey,name\nA-1,P-1,Task one\nA-2,P-1,Task two\n');
    const ds = parser.parse('activities.csv', csv);
    expect(ds.activities).toHaveLength(2);
    expect(ds.activities[0].businessKey).toBe('A-1');
    expect(ds.projects).toHaveLength(0);
  });

  it('routes a projects.csv to the projects bucket', () => {
    const csv = Buffer.from('businessKey,name\nP-1,Sample Project\n');
    const ds = parser.parse('projects.csv', csv);
    expect(ds.projects).toHaveLength(1);
    expect(ds.activities).toHaveLength(0);
  });
});

describe('P6XerParser', () => {
  const parser = new P6XerParser();

  it('parses PROJECT and TASK tables and maps to canonical-raw', () => {
    const xer =
      'ERMHDR\t19.12\n' +
      '%T\tPROJECT\n' +
      '%F\tproj_id\tproj_short_name\tplan_start_date\tscd_end_date\n' +
      '%R\tP-1\tDemo\t2026-01-01 00:00\t2026-06-01 00:00\n' +
      '%T\tTASK\n' +
      '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttarget_drtn_hr_cnt\tphys_complete_pct\n' +
      '%R\tA-1\tP-1\t1.1\tFirst Task\t80\t25\n' +
      '%E\n';
    const ds = parser.parse('demo.xer', Buffer.from(xer));
    expect(ds.projects).toHaveLength(1);
    expect(ds.projects[0].businessKey).toBe('P-1');
    expect(ds.activities).toHaveLength(1);
    expect(ds.activities[0].projectKey).toBe('P-1');
    // 80 hours / 8 = 10 days
    expect(ds.activities[0].plannedDurationDays).toBe(10);
  });

  it('parses TASKPRED logic links + total float + critical flag (CPM linkage)', () => {
    const xer =
      'ERMHDR\t19.12\n' +
      '%T\tTASK\n' +
      '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttotal_float_hr_cnt\tdriving_path_flag\n' +
      '%R\tA-1\tP-1\t1.1\tFoundations\t0\tY\n' +
      '%R\tA-2\tP-1\t1.2\tColumns\t40\tN\n' +
      '%T\tTASKPRED\n' +
      '%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt\n' +
      '%R\t1\tA-2\tA-1\tPR_FS\t16\n' +
      '%E\n';
    const ds = parser.parse('logic.xer', Buffer.from(xer));
    const a1 = ds.activities.find((a) => a.businessKey === 'A-1')!;
    const a2 = ds.activities.find((a) => a.businessKey === 'A-2')!;
    // A-1 is on the driving path with zero float.
    expect(a1.totalFloat).toBe(0);
    expect(a1.isCritical).toBe(true);
    // A-2 carries 40h/8 = 5 days float and is not critical.
    expect(a2.totalFloat).toBe(5);
    expect(a2.isCritical).toBe(false);
    // A-2's predecessor is A-1 (FS, 16h/8 = 2-day lag).
    expect(a2.predecessors).toEqual([{ activityKey: 'A-1', type: 'FS', lagDays: 2 }]);
    // A-1 has no predecessors.
    expect(a1.predecessors).toBeNull();
  });
});

describe('P6XmlParser', () => {
  const parser = new P6XmlParser();

  it('parses APIBusinessObjects with nested Activities', () => {
    const xml =
      '<?xml version="1.0"?><APIBusinessObjects>' +
      '<Project><Id>P-1</Id><Name>Demo</Name>' +
      '<Activity><Id>A-1</Id><Name>First</Name><PercentComplete>30</PercentComplete></Activity>' +
      '</Project></APIBusinessObjects>';
    const buf = Buffer.from(xml);
    expect(parser.supports('demo.xml', buf)).toBe(true);
    const ds = parser.parse('demo.xml', buf);
    expect(ds.projects).toHaveLength(1);
    expect(ds.activities).toHaveLength(1);
    expect(ds.activities[0].projectKey).toBe('P-1');
  });

  it('rejects unrelated XML via supports()', () => {
    expect(parser.supports('other.xml', Buffer.from('<root><x/></root>'))).toBe(false);
  });

  it('parses RelationshipPredecessor links + TotalFloat + IsCritical (CPM linkage)', () => {
    const xml =
      '<?xml version="1.0"?><APIBusinessObjects>' +
      '<Project><Id>P-1</Id><Name>Demo</Name>' +
      '<Activity><Id>A-1</Id><Name>Foundations</Name><TotalFloat>0</TotalFloat><IsCritical>1</IsCritical></Activity>' +
      '<Activity><Id>A-2</Id><Name>Columns</Name><TotalFloat>40</TotalFloat><IsCritical>0</IsCritical></Activity>' +
      '</Project>' +
      '<Relationship><PredecessorActivityId>A-1</PredecessorActivityId><SuccessorActivityId>A-2</SuccessorActivityId><Type>Finish to Start</Type><Lag>8</Lag></Relationship>' +
      '</APIBusinessObjects>';
    const ds = parser.parse('logic.xml', Buffer.from(xml));
    const a1 = ds.activities.find((a) => a.businessKey === 'A-1')!;
    const a2 = ds.activities.find((a) => a.businessKey === 'A-2')!;
    expect(a1.totalFloat).toBe(0);
    expect(a1.isCritical).toBe(true);
    // 40h / 8 = 5 days float.
    expect(a2.totalFloat).toBe(5);
    expect(a2.isCritical).toBe(false);
    // A-1 → A-2 (FS, 8h/8 = 1-day lag).
    expect(a2.predecessors).toEqual([{ activityKey: 'A-1', type: 'FS', lagDays: 1 }]);
  });
});

describe('ParserRegistry', () => {
  const registry = new ParserRegistry(
    new P6XerParser(),
    new P6XmlParser(),
    new MSProjectXmlParser(),
    new ExcelParser(),
    new CsvParser(),
    new (require('./p6-pdf.parser').P6PdfParser)(),
    new (require('./p6-api.parser').P6ApiParser)(),
  );

  it('resolves by file extension and content', () => {
    expect(registry.resolve('a.csv', Buffer.from('x'))).toBeInstanceOf(CsvParser);
    expect(registry.resolve('a.xer', Buffer.from('x'))).toBeInstanceOf(P6XerParser);
    expect(
      registry.resolve('a.xml', Buffer.from('<APIBusinessObjects/>')),
    ).toBeInstanceOf(P6XmlParser);
  });

  it('throws on unsupported files', () => {
    expect(() => registry.resolve('weird.bin', Buffer.from('x'))).toThrow();
  });
});
