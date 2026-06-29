import { ApiProperty } from '@nestjs/swagger';

/**
 * `POST /site-evidence/capture` request body (documentation shape). Mirrors
 * `CaptureEvidenceInput` minus the server-derived `capturedBy`. Used by
 * `@ApiBody` so Swagger emits a non-empty schema; the route keeps its own
 * runtime checks (the global ValidationPipe is not driven off this class).
 */
export class SiteEvidenceCaptureDto {
  @ApiProperty({ description: 'Project business key the capture belongs to.', example: 'P-1000' })
  projectBusinessKey!: string;

  @ApiProperty({ description: 'Media kind.', enum: ['photo', 'video', 'audio', 'transcript'], example: 'photo' })
  mediaKind!: string;

  @ApiProperty({ description: 'Original file name including extension.', example: 'level3-crack.jpg' })
  filename!: string;

  @ApiProperty({ description: 'MIME type of the media.', example: 'image/jpeg' })
  mimeType!: string;

  @ApiProperty({ description: 'Base64-encoded media bytes (archived immutably, SHA-256).', example: '/9j/4AAQSkZJRgABAQ...(base64 of the image)' })
  contentBase64!: string;

  @ApiProperty({ required: false, nullable: true, description: 'When the media was captured on site (ISO datetime, device clock).', example: '2026-06-28T09:14:00Z' })
  capturedAt?: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'Capture latitude (decimal degrees).', example: 25.2048 })
  latitude?: number | string | null;

  @ApiProperty({ required: false, nullable: true, description: 'Capture longitude (decimal degrees).', example: 55.2708 })
  longitude?: number | string | null;

  @ApiProperty({ required: false, nullable: true, description: 'Human-readable location label.', example: 'Level 3, Grid C-4' })
  locationLabel?: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'Canonical Activity businessKey this capture relates to.', example: 'A-1200' })
  activityKey?: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'Name of the worker on site.', example: 'Ahmed K.' })
  workerName?: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'Capturing device id.', example: 'glass-07' })
  deviceId?: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'Device type.', enum: ['smart_glasses', 'phone', 'tablet'], example: 'smart_glasses' })
  deviceType?: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'Verbatim transcript (for mediaKind=transcript, or an audio/video caption).', example: 'Concrete honeycombing observed at column C-4.' })
  transcriptText?: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'When set, promotes the capture into a safety/quality finding.', enum: ['safety', 'quality'], example: 'quality' })
  findingType?: 'safety' | 'quality' | null;
}
