import { ApiProperty } from '@nestjs/swagger';

/**
 * `POST /drawings/upload` request body (documentation shape). Same base64
 * envelope as the other upload surfaces. Used by `@ApiBody` so Swagger emits a
 * non-empty schema and states the honest DWG/DXF story; the route keeps its own
 * runtime checks (the global ValidationPipe is not driven off this class).
 */
export class DrawingUploadDto {
  @ApiProperty({ description: 'Project business key the drawings belong to.', example: 'P-1000' })
  projectKey!: string;

  @ApiProperty({
    description:
      'File name including extension. Accepted formats: .pdf, .dwg, .dxf. ' +
      'PDFs are text-extracted (page count, sheet titles, floor/discipline hints, a bounded text excerpt). ' +
      'DWG/DXF (AutoCAD) are archived immutably (SHA-256); their geometry / quantity / clash extraction is ' +
      'NOT parsed locally — it is performed via the Autodesk APS connector (POST /integrations/autodesk/import → DWG/IFC → counts/clash).',
    example: 'arch-set.dwg',
  })
  filename!: string;

  @ApiProperty({ description: 'Base64-encoded file content (≤ ~25 MB binary).', example: 'JVBERi0xLjcKJ...(base64 of the file)' })
  contentBase64!: string;

  @ApiProperty({ required: false, nullable: true, description: 'Uploader display name (for the audit trail).', example: 'Ahmed K.' })
  uploadedBy?: string | null;
}
