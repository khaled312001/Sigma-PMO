import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';

import { RequiresCapability } from './require-capability.decorator';
import { CapabilitiesService } from './capabilities.service';

interface ReqUser { user?: { displayName?: string } }
interface SetBody { role: string; capability: string; enabled: boolean }

/**
 * `/admin/capabilities` — the admin role-permission control surface.
 *
 *  - GET  is `canRead` so the UI (and every client) can fetch the EFFECTIVE
 *    matrix and gate its navigation by the live permissions.
 *  - POST (set / reset) requires `canManageRoles` — admin only. The change is
 *    enforced immediately: CapabilitiesService rebuilds its in-memory matrix
 *    and the global ApiKeyGuard reads it on the very next request.
 */
@Controller('admin/capabilities')
export class CapabilitiesController {
  constructor(private readonly capabilities: CapabilitiesService) {}

  @Get()
  @RequiresCapability('canRead')
  async snapshot() {
    return {
      roles: this.capabilities.roles(),
      flags: this.capabilities.flags(),
      matrix: this.capabilities.effectiveMatrix(),
      overrides: await this.capabilities.listOverrides(),
    };
  }

  @Post()
  @HttpCode(200)
  @RequiresCapability('canManageRoles')
  async set(@Body() body: SetBody, @Req() req: ReqUser) {
    if (!body?.role || !body?.capability || typeof body?.enabled !== 'boolean') {
      throw new BadRequestException('role, capability and enabled (boolean) are required');
    }
    await this.capabilities.setOverride(
      body.role,
      body.capability,
      body.enabled,
      req.user?.displayName ?? null,
    );
    return this.snapshot();
  }

  @Post('reset')
  @HttpCode(200)
  @RequiresCapability('canManageRoles')
  async reset(@Body() body: { role?: string }) {
    await this.capabilities.reset(body?.role);
    return this.snapshot();
  }
}
