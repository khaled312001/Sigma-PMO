import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
} from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { SETTING_KEYS, SettingsService } from './settings.service';

interface SetSettingBody {
  value: string;
  updatedBy?: string | null;
}

interface SettingDescriptor {
  settingKey: string;
  configured: boolean;
  fingerprint: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

/**
 * /admin/settings — runtime-configurable platform settings.
 *
 * The current Wave 4 use-case is the Anthropic API key entry: a Sigma
 * admin pastes the key in the UI, the value is AES-256-GCM-encrypted by
 * `SettingsService` and persisted to `SystemSetting`. The response never
 * carries the raw value back — only `configured: true|false` and a
 * fingerprint (first 8 + last 4 chars).
 *
 * Read access is gated to `canEditPolicy` so non-admins can't even see
 * the catalogue of configured settings. Writes require the same — the
 * cleanest mapping to the existing capability matrix.
 */
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** All known settings + their configured state. */
  @Get()
  @RequiresCapability('canEditPolicy')
  async list(): Promise<{ catalogue: SettingDescriptor[] }> {
    const keys = Object.values(SETTING_KEYS);
    const catalogue = await Promise.all(keys.map((k) => this.settings.describe(k)));
    return { catalogue };
  }

  /** One setting's descriptor (configured / fingerprint / audit). */
  @Get(':settingKey')
  @RequiresCapability('canEditPolicy')
  get(@Param('settingKey') settingKey: string): Promise<SettingDescriptor> {
    return this.settings.describe(settingKey);
  }

  /** Upsert a setting's value. */
  @Put(':settingKey')
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  async set(
    @Param('settingKey') settingKey: string,
    @Body() body: SetSettingBody,
  ): Promise<SettingDescriptor> {
    if (!body?.value || typeof body.value !== 'string') {
      throw new BadRequestException('"value" (string) is required.');
    }
    if (body.value.length > 4096) {
      throw new BadRequestException('value too large (max 4096 chars).');
    }
    await this.settings.set(settingKey, body.value, body.updatedBy ?? null);
    return this.settings.describe(settingKey);
  }

  /** Clear a setting entirely — effectively un-configures it. */
  @Delete(':settingKey')
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  async clear(@Param('settingKey') settingKey: string): Promise<SettingDescriptor> {
    await this.settings.clear(settingKey);
    return this.settings.describe(settingKey);
  }
}
