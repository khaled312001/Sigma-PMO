import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { RequiresCapability } from '../modules/auth/require-capability.decorator';

/**
 * Probes per the K8s convention:
 *  - GET /live  → always 200 OK; the process is up. Used by liveness probes.
 *  - GET /ready → 200 only when the DB round-trip succeeds. Used by readiness
 *                 probes / load-balancer pool inclusion.
 *  - GET /health → PUBLIC, minimal status only (no build/runtime internals).
 *  - GET /health/details → the env/version/uptime build info, gated behind a
 *                 capability so internal details aren't exposed publicly
 *                 (audit 2026-06-28: separate public health from internal).
 */
@Controller()
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private async dbUp(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  @Get('live')
  live(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ok'; db: 'up'; timestamp: string }> {
    if (!(await this.dbUp())) {
      throw new ServiceUnavailableException({ status: 'not_ready', db: 'down', timestamp: new Date().toISOString() });
    }
    return { status: 'ok', db: 'up', timestamp: new Date().toISOString() };
  }

  // PUBLIC health — minimal on purpose. No env/appEnv/version/uptime here.
  @Get('health')
  async health(): Promise<{ status: string; db: 'up' | 'down'; timestamp: string }> {
    const db = (await this.dbUp()) ? 'up' : 'down';
    return { status: db === 'up' ? 'ok' : 'degraded', db, timestamp: new Date().toISOString() };
  }

  // INTERNAL health — build/runtime details, behind auth (canReadAll).
  @Get('health/details')
  @RequiresCapability('canReadAll')
  async healthDetails(): Promise<{
    status: string;
    db: 'up' | 'down';
    env: string;
    appEnv: string;
    uptimeSeconds: number;
    version: string;
    timestamp: string;
  }> {
    const db = (await this.dbUp()) ? 'up' : 'down';
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      env: process.env.NODE_ENV ?? 'development',
      appEnv: process.env.APP_ENV ?? (process.env.SEED_DEMO === 'true' ? 'demo' : 'production'),
      uptimeSeconds: Math.round(process.uptime()),
      version: process.env.npm_package_version ?? '0.0.1',
      timestamp: new Date().toISOString(),
    };
  }
}
