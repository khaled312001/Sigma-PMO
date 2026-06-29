import { ApiProperty } from '@nestjs/swagger';

/** Clash-detection capability sub-shape (honest about the Navisworks dependency). */
export class ClashDetectionCapabilityDto {
  @ApiProperty({
    description: 'How clash results enter the platform: always by ingesting a Navisworks clash-test export (NWC/NWD/HTML/CSV). The platform does NOT run the clash engine itself.',
    example: 'ingest-navisworks-export',
  })
  mode!: string;

  @ApiProperty({
    description: 'Live in-cloud model coordination is available only through a paid Autodesk Construction Cloud (Model Coordination) account — not bundled here.',
    example: 'requires-paid-acc',
  })
  apsModelCoordination!: string;
}

/** `GET /drawings/capabilities` — honest CAD/BIM capability matrix. */
export class DrawingCapabilitiesDto {
  @ApiProperty({ description: 'File formats this surface accepts.', type: [String], example: ['pdf', 'dwg', 'dxf', 'ifc'] })
  accepts!: string[];

  @ApiProperty({
    description: 'Where geometry / quantity extraction for CAD/BIM happens. DWG/DXF/IFC geometry is extracted via Autodesk APS (Model Derivative), not parsed locally; PDFs are text-extracted locally.',
    example: 'autodesk-aps',
  })
  geometryExtraction!: string;

  @ApiProperty({ description: 'Whether the Autodesk APS connector has credentials configured (env or encrypted SystemSetting). When false, APS geometry extraction is unavailable and DWG/DXF are archive-only.', example: false })
  apsEnabled!: boolean;

  @ApiProperty({ description: 'Clash-detection capability (honest about the Navisworks-export dependency).', type: ClashDetectionCapabilityDto })
  clashDetection!: ClashDetectionCapabilityDto;

  @ApiProperty({
    description: 'Plain-language honesty note about the DWG → IFC → clash story.',
    example:
      'PDFs are text-extracted locally. DWG/DXF/IFC geometry and quantities are extracted via the Autodesk APS Model Derivative service (DWG→IFC→element counts) when APS credentials are configured; otherwise CAD files are archived only. Clash detection is always sourced by ingesting a Navisworks clash-test export — the platform does not run the clash engine itself; live in-cloud Model Coordination needs a paid Autodesk Construction Cloud account.',
  })
  notes!: string;
}
