import { ApiProperty } from '@nestjs/swagger';
import { IsBase64, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/** Browser-friendly base64 upload payload. Hard limits enforced at DTO level. */
export class IngestUploadDto {
  @ApiProperty({
    description: 'File name including extension. Allowed: .xer / .xml (P6/MS-Project), .xlsx (the multi-sheet template), .csv.',
    example: 'sigma-pmo-data-template.xlsx',
    maxLength: 512,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  @Matches(/^[\w. \-()]+\.(xer|xml|xlsx|csv)$/i, {
    message: 'filename must end with .xer, .xml, .xlsx, or .csv and contain only safe characters',
  })
  filename!: string;

  @ApiProperty({
    description: 'Base64-encoded file content. ~34 MB of base64 ≈ ~25 MB binary (the body limit).',
    example: 'UEsDBBQABgAIAAAAIQ...(base64 of the .xlsx)',
  })
  @IsString()
  @IsBase64()
  @MaxLength(35_000_000)
  contentBase64!: string;
}
