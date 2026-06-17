import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  /**
   * Optional company slug — when set (the per-company login page /c/:slug), the
   * sign-in is scoped to that company: the account must belong to it, otherwise
   * the login is rejected even with correct credentials.
   */
  @IsOptional()
  @IsString()
  companySlug?: string;
}

export class SetPasswordDto {
  @IsString()
  @MinLength(8)
  password!: string;
}
