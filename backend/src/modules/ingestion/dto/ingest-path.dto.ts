import { IsNotEmpty, IsString } from 'class-validator';

/** Request to ingest a server-accessible file by absolute or relative path. */
export class IngestPathDto {
  @IsString()
  @IsNotEmpty()
  path!: string;
}
