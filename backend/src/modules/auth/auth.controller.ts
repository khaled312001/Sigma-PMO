import { createHash } from 'node:crypto';

import { Controller, Get, Headers } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../canonical/entities';
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

@Controller('auth')
export class AuthController {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  /**
   * Returns the principal behind the supplied x-api-key, or the bootstrap-mode
   * indicator while no users exist (so the UI can prompt for first-admin
   * creation instead of denying access).
   */
  @Get('me')
  async me(@Headers('x-api-key') rawKey?: string): Promise<MeResponse> {
    const userCount = await this.users.count();
    if (userCount === 0) return { authenticated: false, bootstrapMode: true, user: null };
    if (!rawKey) return { authenticated: false, bootstrapMode: false, user: null };
    const hash = createHash('sha256').update(rawKey).digest('hex');
    const user = await this.users.findOne({ where: { apiKeyHash: hash, active: true } });
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
  async listUsers(): Promise<Array<Omit<User, 'apiKeyHash'>>> {
    const all = await this.users.find({ order: { createdAt: 'DESC' } });
    return all.map(({ apiKeyHash: _hash, ...rest }) => rest);
  }
}
