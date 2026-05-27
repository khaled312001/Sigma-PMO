import { CsvParser } from './csv.parser';
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
});

describe('ParserRegistry', () => {
  const registry = new ParserRegistry(
    new P6XerParser(),
    new P6XmlParser(),
    new ExcelParser(),
    new CsvParser(),
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
