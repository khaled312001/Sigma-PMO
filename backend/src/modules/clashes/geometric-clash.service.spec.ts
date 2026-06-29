import { GeometricClashService } from './geometric-clash.service';
import { IfcGeometryModel, IfcGeometryService } from './ifc-geometry.service';

/** Build a model with one element at a world origin + a bbox half-extent. */
function modelFromIfc(name: string, type: string, guid: string, x: number): IfcGeometryModel {
  const ifc = `ISO-10303-21;
DATA;
#1=IFCPROJECT('0prj',$,'${name}',$,$,$,$,$,$);
#10=IFCCARTESIANPOINT((${x}.,2000.,3000.));
#11=IFCAXIS2PLACEMENT3D(#10,$,$);
#12=IFCLOCALPLACEMENT($,#11);
#13=IFCCARTESIANPOINT((-200.,-200.,-200.));
#14=IFCBOUNDINGBOX(#13,400.,400.,400.);
#15=IFCSHAPEREPRESENTATION(#16,'Box','BoundingBox',(#14));
#17=IFCPRODUCTDEFINITIONSHAPE($,$,(#15));
#18=${type}('${guid}',$,'${type} elem',$,$,#12,#17,$);
ENDSEC;
END-ISO-10303-21;`;
  return new IfcGeometryService().parse(ifc);
}

describe('GeometricClashService.detect', () => {
  const svc = new GeometricClashService();

  it('emits a hard clash for two overlapping cross-discipline elements', () => {
    // Duct X[800,1200] vs Beam X[900,1300] → 300 mm overlap, full Y/Z overlap.
    const mech = modelFromIfc('MEP', 'IFCFLOWSEGMENT', 'mecGuid00000001', 1000);
    const str = modelFromIfc('STR', 'IFCBEAM', 'strGuid00000001', 1100);

    const result = svc.detect(mech, str);
    expect(result.clashes).toHaveLength(1);
    const c = result.clashes[0];
    expect(c.kind).toBe('hard');
    expect(c.disciplinesInvolved.sort()).toEqual(['mechanical', 'structural']);
    expect(c.elementGuidA).toBe('mecGuid00000001');
    expect(c.elementGuidB).toBe('strGuid00000001');
    expect(['critical', 'major', 'minor']).toContain(c.severity);
    // Penetration ≈ 300 mm (the shallowest overlap axis) → hard clash → critical.
    expect(c.penetrationMm).toBeCloseTo(300, 0);
    expect(c.severity).toBe('critical');
    // Overlap centre on X is (900+1200)/2 = 1050.
    expect(c.location.x).toBeCloseTo(1050, 0);
    expect(result.stats.hardClashes).toBe(1);
    expect(c.extentConfidence).toBe('bbox');
  });

  it('skips intra-discipline overlaps (same discipline is adjacency, not a clash)', () => {
    const beamA = modelFromIfc('STR-A', 'IFCBEAM', 'strGuidA', 1000);
    const beamB = modelFromIfc('STR-B', 'IFCBEAM', 'strGuidB', 1100);
    const result = svc.detect(beamA, beamB);
    expect(result.clashes).toHaveLength(0);
  });

  it('emits a clearance (soft) clash when elements are near but not overlapping', () => {
    // Duct X[800,1200] vs Beam X[1210,1610] → 10 mm gap (< 25 mm clearance).
    const mech = modelFromIfc('MEP', 'IFCFLOWSEGMENT', 'mecGuid1', 1000);
    const str = modelFromIfc('STR', 'IFCBEAM', 'strGuid1', 1410);
    const result = svc.detect(mech, str);
    expect(result.clashes).toHaveLength(1);
    expect(result.clashes[0].kind).toBe('clearance');
    expect(result.stats.clearanceClashes).toBe(1);
  });

  it('produces no clash when elements are far apart', () => {
    const mech = modelFromIfc('MEP', 'IFCFLOWSEGMENT', 'mecGuid1', 1000);
    const str = modelFromIfc('STR', 'IFCBEAM', 'strGuid1', 9000);
    const result = svc.detect(mech, str);
    expect(result.clashes).toHaveLength(0);
  });
});
