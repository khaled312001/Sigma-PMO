import { randomBytes } from 'node:crypto';

import {
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../canonical/entities';
import { AuthService } from './auth.service';
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
  } | null;
}

interface UserListItem {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  projectScopes: string;
  active: boolean;
  createdAt: Date;
}

@Controller('auth')
export class AuthController {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly auth: AuthService,
  ) {}

  /** Identity behind the supplied x-api-key (or bootstrap-mode indicator). */
  @Get('me')
  async me(@Headers('x-api-key') rawKey?: string): Promise<MeResponse> {
    const userCount = await this.auth.countUsers();
    if (userCount === 0) return { authenticated: false, bootstrapMode: true, user: null };
    if (!rawKey) return { authenticated: false, bootstrapMode: false, user: null };
    const user = await this.auth.findActiveByApiKey(rawKey);
    if (!user) return { authenticated: false, bootstrapMode: false, user: null };
    return {
      authenticated: true,
      bootstrapMode: false,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        projectScopes: user.projectScopes,
      },
    };
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
      createdAt: u.createdAt,
    }));
  }

  /**
   * Rotate a user's API key. Returns the new raw key once (never persisted).
   * Admin-only.
   */
  @Post('users/:id/rotate-key')
  @HttpCode(200)
  @RequiresCapability('canReadAll')
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
  @RequiresCapability('canReadAll')
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
