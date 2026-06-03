import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Request to ingest a server-accessible file by absolute or relative path. */
export class IngestPathDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  path!: string;
}
