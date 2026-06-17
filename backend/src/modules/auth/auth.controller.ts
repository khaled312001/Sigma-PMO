import { randomBytes } from 'node:crypto';

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Company, User } from '../canonical/entities';
import { AuthService } from './auth.service';
import { LoginDto, SetPasswordDto } from './dto/login.dto';
import { RequiresCapability } from './require-capability.decorator';
import { Role } from './roles.enum';

interface MeResponse {
  authenticated: boolean;
  bootstrapMode: boolean;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: Role;
    projectScopes: string;
    emiratesId: string | null;
    companyId: string | null;
  } | null;
  /** The caller's company (multi-tenant SaaS); null for platform users. */
  company: {
    id: string;
    name: string;
    companyType: string;
    status: string;
    plan: string;
    isOwner: boolean;
  } | null;
}

interface UserListItem {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  projectScopes: string;
  active: boolean;
  hasPassword: boolean;
  emiratesId: string | null;
  createdAt: Date;
}

interface LoginResponse {
  apiKey: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: Role;
    projectScopes: string;
    emiratesId: string | null;
  };
}

interface CreateUserBody {
  email: string;
  displayName: string;
  role: string;
  password: string;
  projectScopes?: string;
  emiratesId?: string | null;
}

interface UpdateUserBody {
  displayName?: string;
  role?: string;
  active?: boolean;
  projectScopes?: string;
  emiratesId?: string | null;
}

@Controller('auth')
export class AuthController {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly auth: AuthService,
  ) {}

  /**
   * Interactive sign-in. Validates email + password and issues a fresh API
   * key on every successful call, rotating any previous key for this user
   * (defence-in-depth: old browser sessions / lost laptops stop working as
   * soon as someone signs in again). The raw key is returned once and stored
   * in localStorage by the browser; subsequent requests carry it as
   * x-api-key.
   */
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto): Promise<LoginResponse> {
    const user = await this.auth.authenticateByPassword(body.email, body.password);
    if (!user) throw new UnauthorizedException('Invalid email or password');

    // Per-company login page (/c/:slug): scope the sign-in to that company so a
    // company's portal only authenticates its OWN users, not every account.
    if (body.companySlug) {
      const company = await this.companies.findOne({ where: { slug: body.companySlug } });
      if (!company || user.companyId !== company.id) {
        throw new UnauthorizedException('This account is not part of this company');
      }
    }

    const apiKey = await this.auth.issueApiKey(user);
    return {
      apiKey,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        projectScopes: user.projectScopes,
        emiratesId: user.emiratesId,
      },
    };
  }

  /**
   * Admin-only password set / reset. Used to assign a password to API-key-
   * only users + as the password-rotation surface. Requires canReadAll (the
   * same gate as user listing / lifecycle).
   */
  @Post('users/:id/set-password')
  @HttpCode(200)
  @RequiresCapability('canManageRoles')
  async setPassword(@Param('id') id: string, @Body() body: SetPasswordDto): Promise<{ ok: true }> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    const { hash, salt } = this.auth.hashPassword(body.password);
    user.passwordHash = hash;
    user.passwordSalt = salt;
    await this.users.save(user);
    return { ok: true };
  }

  /** Identity behind the supplied x-api-key (or bootstrap-mode indicator). */
  @Get('me')
  async me(@Headers('x-api-key') rawKey?: string): Promise<MeResponse> {
    const userCount = await this.auth.countUsers();
    if (userCount === 0) return { authenticated: false, bootstrapMode: true, user: null, company: null };
    if (!rawKey) return { authenticated: false, bootstrapMode: false, user: null, company: null };
    const user = await this.auth.findActiveByApiKey(rawKey);
    if (!user) return { authenticated: false, bootstrapMode: false, user: null, company: null };

    const company = user.companyId
      ? await this.companies.findOne({ where: { id: user.companyId } })
      : null;

    return {
      authenticated: true,
      bootstrapMode: false,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        projectScopes: user.projectScopes,
        emiratesId: user.emiratesId,
        companyId: user.companyId,
      },
      company: company
        ? {
            id: company.id,
            name: company.name,
            companyType: company.companyType,
            status: company.status,
            plan: company.plan,
            isOwner: company.createdById === user.id,
          }
        : null,
    };
  }

  /**
   * Create a user from the admin UI (canManageRoles — admin tier). Hashes the
   * password (scrypt) and issues an API key. Email must be unique.
   */
  @Post('users')
  @HttpCode(200)
  @RequiresCapability('canManageRoles')
  async createUser(@Body() body: CreateUserBody): Promise<{ id: string; apiKey: string }> {
    const email = body?.email?.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new BadRequestException('A valid email is required');
    }
    if (!body?.displayName?.trim()) throw new BadRequestException('displayName is required');
    if (!Object.values(Role).includes(body?.role as Role)) {
      throw new BadRequestException(`role must be one of: ${Object.values(Role).join(', ')}`);
    }
    if (!body?.password || body.password.length < 8) {
      throw new BadRequestException('password must be at least 8 characters');
    }
    const existing = await this.users.findOne({ where: { email } });
    if (existing) throw new ConflictException(`A user with email "${email}" already exists`);

    const rawKey = `sk_${randomBytes(24).toString('hex')}`;
    const { hash, salt } = this.auth.hashPassword(body.password);
    const user = this.users.create({
      email,
      displayName: body.displayName.trim(),
      role: body.role as Role,
      apiKeyHash: this.auth.hashApiKey(rawKey),
      passwordHash: hash,
      passwordSalt: salt,
      projectScopes: body.projectScopes?.trim() || '*',
      emiratesId: body.emiratesId ?? null,
      active: true,
      activityScope: null,
    });
    const saved = await this.users.save(user);
    return { id: saved.id, apiKey: rawKey };
  }

  /**
   * Update a user's profile/role/active flag (canManageRoles). Re-applies the
   * sole-admin guard: you cannot demote or deactivate the last active admin.
   */
  @Patch('users/:id')
  @HttpCode(200)
  @RequiresCapability('canManageRoles')
  async updateUser(@Param('id') id: string, @Body() body: UpdateUserBody): Promise<{ ok: true }> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);

    const demoting = body.role !== undefined && body.role !== Role.SIGMA_ADMIN && user.role === Role.SIGMA_ADMIN;
    const deactivating = body.active === false && user.active && user.role === Role.SIGMA_ADMIN;
    if (demoting || deactivating) {
      const remainingAdmins = await this.auth.countActiveAdmins(id);
      if (remainingAdmins === 0) {
        throw new ConflictException('Cannot demote or deactivate the sole active sigma_admin. Create another admin first.');
      }
    }

    if (body.displayName !== undefined) {
      if (!body.displayName.trim()) throw new BadRequestException('displayName cannot be empty');
      user.displayName = body.displayName.trim();
    }
    if (body.role !== undefined) {
      if (!Object.values(Role).includes(body.role as Role)) {
        throw new BadRequestException(`role must be one of: ${Object.values(Role).join(', ')}`);
      }
      user.role = body.role as Role;
    }
    if (body.active !== undefined) user.active = body.active;
    if (body.projectScopes !== undefined) user.projectScopes = body.projectScopes.trim() || '*';
    if (body.emiratesId !== undefined) user.emiratesId = body.emiratesId;
    await this.users.save(user);
    return { ok: true };
  }

  @Get('users')
  @RequiresCapability('canReadAll')
  async listUsers(): Promise<UserListItem[]> {
    const all = await this.users.find({ order: { createdAt: 'DESC' } });
    return all.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      projectScopes: u.projectScopes,
      active: u.active,
      hasPassword: !!(u.passwordHash && u.passwordSalt),
      emiratesId: u.emiratesId,
      createdAt: u.createdAt,
    }));
  }

  /**
   * Rotate a user's API key. Returns the new raw key once (never persisted).
   * Admin-only.
   */
  @Post('users/:id/rotate-key')
  @HttpCode(200)
  @RequiresCapability('canManageRoles')
  async rotateKey(@Param('id') id: string): Promise<{ apiKey: string }> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    const rawKey = `sk_${randomBytes(24).toString('hex')}`;
    user.apiKeyHash = this.auth.hashApiKey(rawKey);
    await this.users.save(user);
    return { apiKey: rawKey };
  }

  /**
   * Delete a user. Refuses to leave zero active sigma_admins behind — this is
   * the sole-admin escalation protection: it is impossible to fall back into
   * bootstrap mode once at least one admin has existed.
   */
  @Delete('users/:id')
  @HttpCode(200)
  @RequiresCapability('canManageRoles')
  async deleteUser(@Param('id') id: string): Promise<{ deleted: true }> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    if (user.role === Role.SIGMA_ADMIN) {
      const remainingAdmins = await this.auth.countActiveAdmins(id);
      if (remainingAdmins === 0) {
        throw new ConflictException(
          'Cannot delete or deactivate the sole active sigma_admin. Create another admin first.',
        );
      }
    }
    await this.users.remove(user);
    return { deleted: true };
  }
}
