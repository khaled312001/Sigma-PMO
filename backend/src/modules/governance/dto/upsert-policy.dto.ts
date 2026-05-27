import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpsertPolicyDto {
  /** Null/omitted = update the global default policy. */
  @IsOptional()
  @IsString()
  projectKey?: string | null;

  @IsOptional()
  @IsString()
  authoredBy?: string;

  @IsObject()
  config!: Record<string, unknown>;
}
