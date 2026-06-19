import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Two distinct probes per the K8s convention:
 *  - GET /live  → always 200 OK; the process is up. Used by liveness probes.
 *  - GET /ready → 200 only when the DB round-trip succeeds. Used by
 *                 readiness probes / load-balancer pool inclusion.
 *
 * /health is preserved as an alias for /ready for backward compat.
 */
@Controller()
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get('live')
  live(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ok'; db: 'up'; timestamp: string }> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({ status: 'not_ready', db: 'down', timestamp: new Date().toISOString() });
    }
    return { status: 'ok', db: 'up', timestamp: new Date().toISOString() };
  }

  // Backward-compat alias — enriched with environment + uptime + version so the
  // probe doubles as a lightweight build/runtime info endpoint (review 2026-06-19).
  @Get('health')
  async health(): Promise<{
    status: string;
    db: 'up' | 'down';
    env: string;
    appEnv: string;
    uptimeSeconds: number;
    version: string;
    timestamp: string;
  }> {
    let db: 'up' | 'down' = 'down';
    try {
      await this.dataSource.query('SELECT 1');
      db = 'up';
    } catch {
      db = 'down';
    }
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
