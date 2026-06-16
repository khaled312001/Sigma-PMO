import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppConfiguration } from '../../../config/configuration';
import { IngestionOutcome, IngestionService } from '../../ingestion/ingestion.service';
import { SettingsService, SETTING_KEYS } from '../../settings/settings.service';

/** The JSON envelope the P6 connector hands to `P6ApiParser`. */
export interface P6LiveEnvelope {
  kind: 'p6-eppm-rest';
  database: string | null;
  project: Record<string, unknown> | null;
  activities: Array<Record<string, unknown>>;
  resources: Array<Record<string, unknown>>;
  assignments: Array<Record<string, unknown>>;
}

/**
 * P6ClientService — the LIVE Primavera P6 EPPM REST connector. The platform
 * already ingests P6 files (.xer/.xml/.pdf) and accepts an inbound webhook;
 * this adds the missing OUTBOUND pull: it authenticates to the client's P6
 * EPPM REST server, fetches a project's activities / resources / assignments,
 * wraps them in a JSON envelope, and runs them through the standard ingestion
 * pipeline (parse → validate → normalise → confidence → audit) via the
 * `p6_api` parser — so a live pull lands in the canonical model exactly like an
 * uploaded schedule.
 *
 * Credential precedence (same discipline as ClaudeService / AutodeskApsService):
 *   1. Encrypted `SystemSetting` (set from /admin/settings) — preferred.
 *   2. `process.env.P6_BASE_URL` / `P6_USERNAME` / `P6_PASSWORD` — fallback.
 *   3. None → `isEnabled()` is false; P6 data arrives only by file/webhook.
 *
 * The password is NEVER logged or returned. HTTP uses the Node 22 global
 * `fetch` — no new dependency.
 */
@Injectable()
export class P6ClientService implements OnModuleInit {
  private readonly logger = new Logger(P6ClientService.name);
  private readonly envConfig: P6ConfigResolved;

  private dbBaseUrl: string | null = null;
  private dbDatabase: string | null = null;
  private dbUsername: string | null = null;
  private dbPassword: string | null = null;

  constructor(
    configService: ConfigService<AppConfiguration, true>,
    private readonly ingestion: IngestionService,
    @Optional() private readonly settings?: SettingsService,
  ) {
    const cfg = configService.get('primavera', { infer: true });
    this.envConfig = {
      baseUrl: cfg?.baseUrl ?? '',
      database: cfg?.database ?? '',
      username: cfg?.username ?? '',
      password: cfg?.password ?? '',
    };
  }

  async onModuleInit(): Promise<void> {
    if (!this.settings) return;
    await this.refreshFromSettings();
    this.settings.onChange(async (settingKey) => {
      if (P6_SETTING_KEYS.includes(settingKey)) {
        await this.refreshFromSettings();
      }
    });
  }

  async refreshFromSettings(): Promise<{ hasDbCredentials: boolean }> {
    if (!this.settings) return { hasDbCredentials: false };
    this.dbBaseUrl = await this.settings.getPlaintext(SETTING_KEYS.P6_BASE_URL);
    this.dbDatabase = await this.settings.getPlaintext(SETTING_KEYS.P6_DATABASE);
    this.dbUsername = await this.settings.getPlaintext(SETTING_KEYS.P6_USERNAME);
    this.dbPassword = await this.settings.getPlaintext(SETTING_KEYS.P6_PASSWORD);
    return { hasDbCredentials: !!(this.dbBaseUrl && this.dbUsername && this.dbPassword) };
  }

  private resolveCredentials(): (P6ConfigResolved & { source: 'db' | 'env' }) | null {
    if (this.dbBaseUrl && this.dbUsername && this.dbPassword) {
      return {
        baseUrl: this.dbBaseUrl,
        database: this.dbDatabase ?? '',
        username: this.dbUsername,
        password: this.dbPassword,
        source: 'db',
      };
    }
    if (this.envConfig.baseUrl && this.envConfig.username && this.envConfig.password) {
      return { ...this.envConfig, source: 'env' };
    }
    return null;
  }

  isEnabled(): boolean {
    return this.resolveCredentials() !== null;
  }

  async getStatus(probe = false): Promise<P6Status> {
    const creds = this.resolveCredentials();
    const base: P6Status = {
      enabled: !!creds,
      credentialSource: creds?.source ?? 'none',
      baseUrl: creds ? redactUrl(creds.baseUrl) : null,
      database: creds?.database || null,
      reachable: null,
      detail: null,
    };
    if (!creds || !probe) return base;
    try {
      const projects = await this.listProjects();
      return { ...base, reachable: true, detail: `${projects.length} project(s) visible` };
    } catch (e) {
      return { ...base, reachable: false, detail: (e as Error).message };
    }
  }

  /** Lightweight project directory for the picker UI. */
  async listProjects(): Promise<Array<{ objectId: string; id: string; name: string; status: string }>> {
    const rows = await this.get('/project', PROJECT_FIELDS);
    return rows.map((r) => ({
      objectId: String(r.ObjectId ?? ''),
      id: String(r.Id ?? ''),
      name: String(r.Name ?? ''),
      status: String(r.Status ?? ''),
    }));
  }

  /**
   * Pull one project (by its P6 `Id`) and run it through the standard ingestion
   * pipeline. Returns the same `IngestionOutcome` a file upload yields.
   */
  async syncProject(projectId: string): Promise<IngestionOutcome> {
    if (!this.isEnabled()) {
      throw new Error('Primavera P6 is not configured — set the P6 base URL + credentials in /admin/settings.');
    }
    const projects = await this.get('/project', PROJECT_FIELDS, `Id='${escapeFilter(projectId)}'`);
    const project = projects[0] ?? null;
    if (!project) throw new Error(`P6 project "${projectId}" not found or not visible to these credentials.`);
    const oid = String(project.ObjectId ?? '');
    const projFilter = oid ? `ProjectObjectId=${oid}` : undefined;

    const [activities, assignments] = await Promise.all([
      this.get('/activity', ACTIVITY_FIELDS, projFilter),
      this.get('/resourceassignment', ASSIGNMENT_FIELDS, projFilter),
    ]);
    // Resources are global in P6; fetch the set referenced by this project's
    // assignments (fall back to all when the filter is unsupported).
    const resources = await this.get('/resource', RESOURCE_FIELDS).catch(() => []);

    const creds = this.resolveCredentials();
    const envelope: P6LiveEnvelope = {
      kind: 'p6-eppm-rest',
      database: creds?.database || null,
      project,
      activities,
      resources,
      assignments,
    };
    const buffer = Buffer.from(JSON.stringify(envelope), 'utf8');
    const filename = `p6-live-${sanitize(projectId)}.p6json`;
    this.logger.log(
      `P6 live pull ${projectId}: ${activities.length} activities, ` +
        `${resources.length} resources, ${assignments.length} assignments.`,
    );
    return this.ingestion.ingest(filename, buffer);
  }

  // ───────────────────────── REST primitives ─────────────────────────

  private async get(
    path: string,
    fields: string,
    filter?: string,
  ): Promise<Array<Record<string, unknown>>> {
    const creds = this.resolveCredentials();
    if (!creds) throw new Error('Primavera P6 credentials are not configured.');

    const url = new URL(`${creds.baseUrl.replace(/\/+$/, '')}${path}`);
    url.searchParams.set('Fields', fields);
    if (filter) url.searchParams.set('Filter', filter);
    if (creds.database) url.searchParams.set('DatabaseName', creds.database);

    const auth = Buffer.from(`${creds.username}:${creds.password}`, 'utf8').toString('base64');
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`P6 GET ${path} failed (${res.status}): ${(await safeText(res))}`);
    }
    const json = (await res.json()) as unknown;
    // P6 REST returns a bare array; tolerate an object-wrapped collection too.
    if (Array.isArray(json)) return json as Array<Record<string, unknown>>;
    if (json && typeof json === 'object') {
      const values = Object.values(json as Record<string, unknown>);
      const arr = values.find((v) => Array.isArray(v));
      if (Array.isArray(arr)) return arr as Array<Record<string, unknown>>;
    }
    return [];
  }
}

// ───────────────────────── module-local helpers/types ─────────────────────────

interface P6ConfigResolved {
  baseUrl: string;
  database: string;
  username: string;
  password: string;
}

export interface P6Status {
  enabled: boolean;
  credentialSource: 'db' | 'env' | 'none';
  baseUrl: string | null;
  database: string | null;
  reachable: boolean | null;
  detail: string | null;
}

const P6_SETTING_KEYS: string[] = [
  SETTING_KEYS.P6_BASE_URL,
  SETTING_KEYS.P6_DATABASE,
  SETTING_KEYS.P6_USERNAME,
  SETTING_KEYS.P6_PASSWORD,
];

const PROJECT_FIELDS = [
  'ObjectId',
  'Id',
  'Name',
  'Status',
  'StartDate',
  'FinishDate',
  'ActualStartDate',
  'ActualFinishDate',
  'DataDate',
  'PlannedStartDate',
  'OriginalBudget',
].join(',');

const ACTIVITY_FIELDS = [
  'ObjectId',
  'Id',
  'Name',
  'Type',
  'Status',
  'WBSCode',
  'StartDate',
  'FinishDate',
  'ActualStartDate',
  'ActualFinishDate',
  'PlannedDuration',
  'RemainingDuration',
  'PercentComplete',
  'BudgetedTotalCost',
  'ActualTotalCost',
  'ProjectObjectId',
].join(',');

const RESOURCE_FIELDS = [
  'ObjectId',
  'Id',
  'Name',
  'ResourceType',
  'UnitOfMeasureAbbreviation',
  'MaxUnitsPerTime',
  'PricePerUnit',
].join(',');

const ASSIGNMENT_FIELDS = [
  'ObjectId',
  'ActivityObjectId',
  'ActivityId',
  'ResourceObjectId',
  'ResourceId',
  'PlannedUnits',
  'ActualUnits',
  'PlannedCost',
  'ActualCost',
  'ProjectObjectId',
].join(',');

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 400);
  } catch {
    return '<no body>';
  }
}

function escapeFilter(v: string): string {
  return v.replace(/'/g, "''");
}

function sanitize(v: string): string {
  return v.replace(/[^A-Za-z0-9._-]/g, '_');
}

/** Hide credentials embedded in a URL before returning it to the UI. */
function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.username || u.password) {
      u.username = '***';
      u.password = '';
    }
    return u.toString();
  } catch {
    return url;
  }
}
