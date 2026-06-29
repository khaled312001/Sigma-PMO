import { IfcGeometryService } from './ifc-geometry.service';

/**
 * A tiny crafted IFC STEP text with two physical elements placed via
 * IFCLOCALPLACEMENT → IFCAXIS2PLACEMENT3D → IFCCARTESIANPOINT, each carrying an
 * IFCBOUNDINGBOX. The duct and beam AABBs overlap by a known amount so the
 * geometry parser can be asserted against hand-computed coordinates.
 *
 *   Duct: origin (1000,2000,3000), bbox 400×400×400 → X [800,1200]
 *   Beam: origin (1100,2000,3000), bbox 400×400×400 → X [900,1300]
 *   → X overlap [900,1200] (300 mm), full Y/Z overlap.
 */
const CRAFTED_IFC = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('crafted.ifc','2026-06-28T00:00:00',(''),(''),'Sigma','Sigma','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('0pRoJeCt',$,'Crafted',$,$,$,$,$,$);
#2=IFCCARTESIANPOINT((0.,0.,0.));
#3=IFCAXIS2PLACEMENT3D(#2,$,$);
#4=IFCLOCALPLACEMENT($,#3);
#10=IFCCARTESIANPOINT((1000.,2000.,3000.));
#11=IFCAXIS2PLACEMENT3D(#10,$,$);
#12=IFCLOCALPLACEMENT(#4,#11);
#13=IFCCARTESIANPOINT((-200.,-200.,-200.));
#14=IFCBOUNDINGBOX(#13,400.,400.,400.);
#15=IFCSHAPEREPRESENTATION(#16,'Box','BoundingBox',(#14));
#16=IFCREPRESENTATIONCONTEXT($,$);
#17=IFCPRODUCTDEFINITIONSHAPE($,$,(#15));
#18=IFCFLOWSEGMENT('mecGuid00000001',$,'HVAC Duct DN400',$,$,#12,#17,$);
#20=IFCCARTESIANPOINT((1100.,2000.,3000.));
#21=IFCAXIS2PLACEMENT3D(#20,$,$);
#22=IFCLOCALPLACEMENT(#4,#21);
#23=IFCCARTESIANPOINT((-200.,-200.,-200.));
#24=IFCBOUNDINGBOX(#23,400.,400.,400.);
#25=IFCSHAPEREPRESENTATION(#26,'Box','BoundingBox',(#24));
#26=IFCREPRESENTATIONCONTEXT($,$);
#27=IFCPRODUCTDEFINITIONSHAPE($,$,(#25));
#28=IFCBEAM('strGuid00000001',$,'RC Beam B-12',$,$,#22,#27,$);
ENDSEC;
END-ISO-10303-21;`;

describe('IfcGeometryService', () => {
  const svc = new IfcGeometryService();

  it('resolves world placement + bbox extent from the IFCLOCALPLACEMENT chain', () => {
    const model = svc.parse(CRAFTED_IFC);
    expect(model.projectName).toBe('Crafted');
    expect(model.elements).toHaveLength(2);

    const duct = model.elements.find((e) => e.type === 'IFCFLOWSEGMENT')!;
    const beam = model.elements.find((e) => e.type === 'IFCBEAM')!;

    expect(duct.guid).toBe('mecGuid00000001');
    expect(duct.world).toEqual({ x: 1000, y: 2000, z: 3000 });
    expect(duct.extentSource).toBe('bbox');
    // bbox 400 → half 200 → AABB [800,1200]×[1800,2200]×[2800,3200].
    expect(duct.aabb).toEqual({ minX: 800, minY: 1800, minZ: 2800, maxX: 1200, maxY: 2200, maxZ: 3200 });

    expect(beam.guid).toBe('strGuid00000001');
    expect(beam.world).toEqual({ x: 1100, y: 2000, z: 3000 });
    expect(beam.aabb.minX).toBe(900);
    expect(beam.aabb.maxX).toBe(1300);
  });

  it('falls back to a low-confidence placement box when no geometry is present', () => {
    const ifc = `ISO-10303-21;
DATA;
#1=IFCCARTESIANPOINT((500.,600.,700.));
#2=IFCAXIS2PLACEMENT3D(#1,$,$);
#3=IFCLOCALPLACEMENT($,#2);
#4=IFCCOLUMN('colGuid00000001',$,'Column C-1',$,$,#3,$,$);
ENDSEC;
END-ISO-10303-21;`;
    const model = svc.parse(ifc);
    const col = model.elements[0];
    expect(col.world).toEqual({ x: 500, y: 600, z: 700 });
    expect(col.extentSource).toBe('placement');
  });
});
