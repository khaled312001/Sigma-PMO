import { ApiProperty } from '@nestjs/swagger';

/** `POST /integrations/autodesk/import` request body (documentation shape). */
export class AutodeskImportDto {
  @ApiProperty({ description: 'Project business key the model belongs to.', example: 'P-1000' })
  projectKey!: string;

  @ApiProperty({ description: 'Model file name. Revit/IFC/Navisworks/DWG are accepted by APS Model Derivative.', example: 'tower-a.rvt' })
  filename!: string;

  @ApiProperty({ description: 'Base64-encoded model bytes.', example: 'UEsDBBQABg...(base64 of the model)' })
  contentBase64!: string;

  @ApiProperty({ required: false, description: 'Target APS bucket key (auto-derived when omitted).', example: 'sigma-p-1000' })
  bucketKey?: string;

  @ApiProperty({ required: false, nullable: true, description: 'Uploader display name (audit trail).', example: 'Ahmed K.' })
  uploadedBy?: string | null;

  @ApiProperty({ required: false, description: 'Model Derivative output. svf2 = viewer + QS counts; ifc = the DWG→IFC translation.', enum: ['svf2', 'ifc'], example: 'ifc' })
  outputFormat?: 'svf2' | 'ifc';
}

/** `GET /integrations/autodesk/status` response (documentation shape). */
export class AutodeskStatusDto {
  @ApiProperty({ description: 'Whether the APS connector has usable credentials. When false the BIM surface stays on the local IFC parser.', example: false })
  enabled!: boolean;

  @ApiProperty({ description: 'Where the credentials came from.', enum: ['db', 'env', 'none'], example: 'none' })
  credentialSource!: string;

  @ApiProperty({ nullable: true, description: 'UI-friendly view of credentialSource: settings (encrypted /admin/settings), env, or null when unconfigured.', enum: ['settings', 'env'], example: null })
  configuredVia!: 'settings' | 'env' | null;

  @ApiProperty({ description: 'APS base host in use.', example: 'https://developer.api.autodesk.com' })
  baseUrl!: string;

  @ApiProperty({ description: 'Exact server-side env vars the Model Derivative pipeline needs (no callback/3-legged vars). Secrets are never returned.', type: [String], example: ['AUTODESK_CLIENT_ID', 'AUTODESK_CLIENT_SECRET'] })
  requiredEnv!: string[];

  @ApiProperty({ nullable: true, description: 'Live token-probe result (null when not probed).', example: null })
  reachable!: boolean | null;

  @ApiProperty({ nullable: true, description: 'Probe detail / error message.', example: null })
  detail!: string | null;
}

/** `GET /integrations/autodesk/viewer-token` response (documentation shape). */
export class AutodeskViewerTokenDto {
  @ApiProperty({ description: '2-legged viewables:read token for the front-end Autodesk Viewer.', example: 'eyJhbGciOi...' })
  accessToken!: string;

  @ApiProperty({ description: 'Token lifetime in seconds.', example: 3600 })
  expiresIn!: number;
}
