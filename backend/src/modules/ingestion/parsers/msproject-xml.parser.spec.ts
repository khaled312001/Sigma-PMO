import { MSProjectXmlParser } from './msproject-xml.parser';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Title>Sample Project</Title>
  <Name>SAMPLE-001</Name>
  <StartDate>2026-01-01T08:00:00</StartDate>
  <FinishDate>2026-06-30T17:00:00</FinishDate>
  <StatusDate>2026-05-15T00:00:00</StatusDate>
  <Company>Sample Holdings</Company>
  <CurrencyCode>USD</CurrencyCode>
  <Tasks>
    <Task>
      <UID>1</UID>
      <ID>1</ID>
      <Name>Project summary</Name>
      <OutlineLevel>0</OutlineLevel>
      <Summary>1</Summary>
      <Duration>PT240H0M0S</Duration>
    </Task>
    <Task>
      <UID>2</UID>
      <ID>2</ID>
      <Name>Site mobilisation</Name>
      <OutlineLevel>1</OutlineLevel>
      <WBS>1.1</WBS>
      <Start>2026-01-01T08:00:00</Start>
      <Finish>2026-01-15T17:00:00</Finish>
      <Duration>PT80H0M0S</Duration>
      <PercentComplete>100</PercentComplete>
      <ActualStart>2026-01-02T08:00:00</ActualStart>
      <ActualFinish>2026-01-16T17:00:00</ActualFinish>
      <Cost>80000</Cost>
      <ActualCost>86500</ActualCost>
    </Task>
  </Tasks>
  <Resources>
    <Resource>
      <UID>1</UID>
      <ID>1</ID>
      <Name>Civil Crew</Name>
      <Type>1</Type>
      <MaxUnits>1</MaxUnits>
      <StandardRate>24</StandardRate>
    </Resource>
    <Resource>
      <UID>2</UID>
      <ID>2</ID>
      <Name>Concrete C40</Name>
      <Type>0</Type>
      <MaterialLabel>m3</MaterialLabel>
      <StandardRate>95</StandardRate>
    </Resource>
  </Resources>
  <Assignments>
    <Assignment>
      <UID>1</UID>
      <TaskUID>2</TaskUID>
      <ResourceUID>1</ResourceUID>
      <Work>PT80H0M0S</Work>
      <ActualWork>PT88H0M0S</ActualWork>
      <Cost>1920</Cost>
      <ActualCost>2112</ActualCost>
    </Assignment>
  </Assignments>
</Project>`;

describe('MSProjectXmlParser', () => {
  const parser = new MSProjectXmlParser();
  const buf = Buffer.from(SAMPLE_XML);

  it('detects MS Project XML by schema marker', () => {
    expect(parser.supports('schedule.xml', buf)).toBe(true);
  });

  it('rejects non-MS-Project XML', () => {
    const apiXml = Buffer.from('<?xml version="1.0"?><APIBusinessObjects><Project><Id>P-1</Id></Project></APIBusinessObjects>');
    expect(parser.supports('demo.xml', apiXml)).toBe(false);
  });

  it('rejects non-XML extensions', () => {
    expect(parser.supports('schedule.txt', buf)).toBe(false);
  });

  it('extracts project + activities + resources + assignments and skips the summary task', () => {
    const ds = parser.parse('schedule.xml', buf);
    expect(ds.projects).toHaveLength(1);
    expect(ds.projects[0].businessKey).toBe('Sample Project');
    expect(ds.projects[0].name).toBe('Sample Project');
    expect(ds.projects[0].clientName).toBe('Sample Holdings');

    // Summary task (OutlineLevel = 0) is skipped.
    expect(ds.activities).toHaveLength(1);
    expect(ds.activities[0].businessKey).toBe('2');
    expect(ds.activities[0].name).toBe('Site mobilisation');
    expect(ds.activities[0].wbsCode).toBe('1.1');
    expect(ds.activities[0].plannedDurationDays).toBe(10);
    expect(ds.activities[0].budgetedCost).toBe('80000');

    expect(ds.resources).toHaveLength(2);
    // Type=1 → labor; Type=0 → material.
    expect(ds.resources[0].resourceType).toBe('labor');
    expect(ds.resources[1].resourceType).toBe('material');

    expect(ds.assignments).toHaveLength(1);
    expect(ds.assignments[0].activityKey).toBe('2');
    expect(ds.assignments[0].resourceKey).toBe('1');
    // Work was 80 hours = 10 days → back to hours = 80.
    expect(ds.assignments[0].plannedUnits).toBe(80);
    expect(ds.assignments[0].actualUnits).toBe(88);
  });

  it('parses ISO 8601 durations including the days portion', () => {
    const xml = SAMPLE_XML.replace('<Duration>PT80H0M0S</Duration>', '<Duration>P2DT8H</Duration>');
    const result = parser.parse('a.xml', Buffer.from(xml));
    // 2 days + 8 hours = 56 hours / 8 = 7 days.
    expect(result.activities[0].plannedDurationDays).toBe(7);
  });
});
