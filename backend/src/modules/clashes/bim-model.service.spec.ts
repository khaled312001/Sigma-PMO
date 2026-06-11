import { Repository } from 'typeorm';

import { ProjectRecord } from '../canonical/entities';
import { StorageService } from '../ingestion/storage/storage.service';
import { BimModelService } from './bim-model.service';

/**
 * A minimal-but-realistic IFC STEP body covering every entity family the
 * deterministic parser tallies, plus two well-named storeys with elevations.
 */
const SAMPLE_IFC = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('sample.ifc','2026-06-12T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('0proj',#2,'Sample Tower',$,$,$,$,(#10),#11);
#11=IFCUNITASSIGNMENT((#12));
#12=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#20=IFCBUILDINGSTOREY('0s1',#2,'Level 00',$,$,#3,$,'Ground',.ELEMENT.,0.);
#21=IFCBUILDINGSTOREY('0s2',#2,'Level 01',$,$,#4,$,'First',.ELEMENT.,3500.);
#30=IFCSPACE('0sp1',#2,'Lobby',$,$,#5,$,$,.ELEMENT.,.INTERNAL.,$);
#40=IFCWALLSTANDARDCASE('0w1',#2,'Wall-1',$,$,#6,#7,$);
#41=IFCWALL('0w2',#2,'Wall-2',$,$,#6,#7,$);
#50=IFCSLAB('0sl1',#2,'Slab-1',$,$,#6,#7,$,.FLOOR.);
#60=IFCCOLUMN('0c1',#2,'Col-1',$,$,#6,#7,$);
#70=IFCBEAM('0b1',#2,'Beam-1',$,$,#6,#7,$);
#80=IFCDOOR('0d1',#2,'Door-1',$,$,#6,#7,$,2100.,900.,$,$,$);
#90=IFCWINDOW('0win1',#2,'Win-1',$,$,#6,#7,$,1200.,1500.,$,$,$);
ENDSEC;
END-ISO-10303-21;`;

function makeService(): { svc: BimModelService; saved: ProjectRecord[] } {
  const saved: ProjectRecord[] = [];
  const repo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((x: Partial<ProjectRecord>) => x as ProjectRecord),
    save: jest.fn(async (x: ProjectRecord) => { saved.push(x); return { ...x, id: 'rec-1' }; }),
    find: jest.fn().mockResolvedValue([]),
  } as unknown as Repository<ProjectRecord>;
  const storage = {
    sha256: jest.fn(() => 'deadbeef'),
    archive: jest.fn(async () => '/archive/deadbeef__sample.ifc'),
  } as unknown as StorageService;
  return { svc: new BimModelService(repo, storage), saved };
}

describe('BimModelService (IFC parser)', () => {
  it('counts every entity family and parses storeys with elevations', async () => {
    const { svc } = makeService();
    const row = await svc.ingestIfc({
      projectKey: 'PRJ-1',
      filename: 'sample.ifc',
      buffer: Buffer.from(SAMPLE_IFC, 'utf8'),
    });
    const d = row.details as Record<string, any>;
    expect(d.counts).toMatchObject({
      storeys: 2, spaces: 1, walls: 2, slabs: 1, columns: 1, beams: 1, doors: 1, windows: 1,
    });
    expect(d.projectName).toBe('Sample Tower');
    expect(d.unitsDefined).toBe(true);
    expect(d.storeys).toHaveLength(2);
    expect(d.storeys[0]).toMatchObject({ name: 'Level 00', elevation: 0 });
    expect(d.storeys[1]).toMatchObject({ name: 'Level 01', elevation: 3500 });
  });

  it('passes all validation + governance checks for a well-formed model', async () => {
    const { svc } = makeService();
    const row = await svc.ingestIfc({ projectKey: 'PRJ-1', filename: 'sample.ifc', buffer: Buffer.from(SAMPLE_IFC, 'utf8') });
    const checks = (row.details as Record<string, any>).checks;
    expect(checks.validation.every((c: any) => c.pass)).toBe(true);
    expect(checks.governance.find((c: any) => c.check.startsWith('Storey naming')).pass).toBe(true);
    expect(checks.governance.find((c: any) => c.check === 'Project name set').pass).toBe(true);
    expect(row.status).toBe('valid');
  });

  it('rejects a non-IFC buffer', async () => {
    const { svc } = makeService();
    await expect(
      svc.ingestIfc({ projectKey: 'PRJ-1', filename: 'note.ifc', buffer: Buffer.from('hello world', 'utf8') }),
    ).rejects.toThrow(/IFC STEP/i);
  });

  it('rejects a non-.ifc filename', async () => {
    const { svc } = makeService();
    await expect(
      svc.ingestIfc({ projectKey: 'PRJ-1', filename: 'model.rvt', buffer: Buffer.from(SAMPLE_IFC, 'utf8') }),
    ).rejects.toThrow(/\.ifc/i);
  });
});
