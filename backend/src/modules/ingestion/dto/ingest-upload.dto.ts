import { IsBase64, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/** Browser-friendly base64 upload payload. Hard limits enforced at DTO level. */
export class IngestUploadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  @Matches(/^[\w. \-()]+\.(xer|xml|xlsx|csv)$/i, {
    message: 'filename must end with .xer, .xml, .xlsx, or .csv and contain only safe characters',
  })
  filename!: string;

  /** ~34 MB of base64 corresponds to ~25 MB binary; aligns with body limit. */
  @IsString()
  @IsBase64()
  @MaxLength(35_000_000)
  contentBase64!: string;
}
