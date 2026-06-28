import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'Account email.', example: 'admin@sigma.local', format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Account password (min 8 chars). On success the response includes a fresh x-api-key for all other endpoints.', example: 'Sg!ElFo6k4ZgZW2#26', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({
    description: 'Optional company slug — when set (the per-company login page /c/:slug) the sign-in is scoped to that company; the account must belong to it, otherwise login is rejected even with correct credentials.',
    example: 'acme-construction',
  })
  @IsOptional()
  @IsString()
  companySlug?: string;
}

export class SetPasswordDto {
  @ApiProperty({ description: 'New password (min 8 characters).', example: 'new_secure_pass_123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}
