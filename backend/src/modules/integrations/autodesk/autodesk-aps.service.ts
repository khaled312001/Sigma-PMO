import { Injectable, Logger, OnModuleInit, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppConfiguration } from '../../../config/configuration';
import { BimCounts } from '../../clashes/bim-model.service';
import { SettingsService, SETTING_KEYS } from '../../settings/settings.service';

/**
 * AutodeskApsService — live BIM integration via Autodesk Platform Services
 * (APS, formerly Forge). The platform's Quantity-Survey pipeline already
 * consumes BIM element COUNTS (`BimCounts` → `deriveQuantitiesFromBim` → Cost
 * Classification). Until now those counts came only from the local hand-rolled
 * IFC parser. This service adds the missing live path: it authenticates with
 * the client's APS app (2-legged OAuth), uploads a Revit/IFC/Navisworks model,
 * runs a Model Derivative translation, and reads back the element properties to
 * produce the SAME `BimCounts` shape — so the existing QS feature works against
 * real Autodesk models with nothing more than the client's credentials.
 *
 * Credential precedence (identical discipline to ClaudeService):
 *   1. Encrypted `SystemSetting` (set from /admin/settings) — preferred.
 *   2. `process.env.AUTODESK_CLIENT_ID` / `AUTODESK_CLIENT_SECRET` — fallback.
 *   3. None  → `isEnabled()` is false; the BIM surface stays on the local parser.
 *
 * The secret is NEVER logged and NEVER returned to a caller. All HTTP uses the
 * Node 22 global `fetch` — no new dependency.
 */
@Injectable()
export class AutodeskApsService implements OnModuleInit {
  private readonly logger = new Logger(AutodeskApsService.name);
  private readonly config: AutodeskConfigResolved;

  private dbClientId: string | null = null;
  private dbClientSecret: string | null = null;

  /** Cached 2-legged tokens keyed by the requested scope string. */
  private readonly tokenCache = new Map<string, { token: string; expiresAt: number }>();

  constructor(
    configService: ConfigService<AppConfiguration, true>,
    @Optional() private readonly settings?: SettingsService,
  ) {
    const cfg = configService.get('autodesk', { infer: true });
    this.config = {
      clientId: cfg?.clientId ?? '',
      clientSecret: cfg?.clientSecret ?? '',
      baseUrl: (cfg?.baseUrl ?? 'https://developer.api.autodesk.com').replace(/\/+$/, ''),
    };
  }

  async onModuleInit(): Promise<void> {
    if (!this.settings) return;
    await this.refreshFromSettings();
    this.settings.onChange(async (settingKey) => {
      if (
        settingKey === SETTING_KEYS.AUTODESK_CLIENT_ID ||
        settingKey === SETTING_KEYS.AUTODESK_CLIENT_SECRET
      ) {
        await this.refreshFromSettings();
      }
    });
  }

  /** Re-read the DB credentials and invalidate any cached token. */
  async refreshFromSettings(): Promise<{ hasDbCredentials: boolean }> {
    if (!this.settings) return { hasDbCredentials: false };
    this.dbClientId = await this.settings.getPlaintext(SETTING_KEYS.AUTODESK_CLIENT_ID);
    this.dbClientSecret = await this.settings.getPlaintext(SETTING_KEYS.AUTODESK_CLIENT_SECRET);
    this.tokenCache.clear();
    return { hasDbCredentials: !!(this.dbClientId && this.dbClientSecret) };
  }

  private resolveCredentials(): { clientId: string; clientSecret: string; source: 'db' | 'env' } | null {
    if (this.dbClientId && this.dbClientSecret) {
      return { clientId: this.dbClientId, clientSecret: this.dbClientSecret, source: 'db' };
    }
    if (this.config.clientId && this.config.clientSecret) {
      return { clientId: this.config.clientId, clientSecret: this.config.clientSecret, source: 'env' };
    }
    return null;
  }

  isEnabled(): boolean {
    return this.resolveCredentials() !== null;
  }

  /**
   * Diagnostic for /admin — never returns the secret. When `probe` is true it
   * actually requests a token so the UI can confirm the credentials are valid.
   */
  async getStatus(probe = false): Promise<AutodeskStatus> {
    const creds = this.resolveCredentials();
    const base: AutodeskStatus = {
      enabled: !!creds,
      credentialSource: creds?.source ?? 'none',
      // UI-friendly alias of `credentialSource` (db→settings): how the connector
      // is configured, or null when it is not. The encrypted SystemSetting path
      // is surfaced as 'settings' because that is the /admin/settings screen.
      configuredVia: creds ? (creds.source === 'db' ? 'settings' : 'env') : null,
      baseUrl: this.config.baseUrl,
      // The EXACT server-side env vars this Model Derivative pipeline needs.
      // A callback URL / 3-legged scopes are NOT required for 2-legged
      // client-credentials translation — only AUTODESK_CLIENT_ID + _SECRET (and
      // optionally AUTODESK_BASE_URL). The secret value is NEVER returned.
      requiredEnv: REQUIRED_ENV,
      reachable: null,
      detail: null,
    };
    if (!creds || !probe) return base;
    try {
      await this.getToken(VIEWER_SCOPES);
      return { ...base, reachable: true };
    } catch (e) {
      return { ...base, reachable: false, detail: (e as Error).message };
    }
  }

  /**
   * 2-legged token scoped for the front-end Autodesk Viewer (`viewables:read`).
   * Safe to hand to the browser — it cannot write or read your buckets.
   */
  async getViewerToken(): Promise<{ accessToken: string; expiresIn: number }> {
    const { token, expiresAt } = await this.getTokenRecord(VIEWER_SCOPES);
    return { accessToken: token, expiresIn: Math.max(0, Math.round((expiresAt - Date.now()) / 1000)) };
  }

  /**
   * Full BIM import: upload → translate → poll → read properties → counts.
   * Returns the URN (for the viewer) + the derived `BimCounts` the QS pipeline
   * consumes. Long-running (translation can take seconds to minutes); the
   * controller runs it behind `canIngest`.
   */
  async importModel(input: {
    filename: string;
    buffer: Buffer;
    bucketKey?: string;
    /** Model Derivative output format — `svf2` (default, viewer + counts) or `ifc`. */
    outputFormat?: DerivativeFormat;
  }): Promise<AutodeskImportResult> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Autodesk APS is not configured — set the client id/secret in /admin/settings.');
    }
    const objectKey = sanitizeObjectKey(input.filename);
    const bucketKey = (input.bucketKey ?? this.defaultBucketKey()).toLowerCase();

    await this.ensureBucket(bucketKey);
    const objectId = await this.uploadObject(bucketKey, objectKey, input.buffer);
    const urn = toUrn(objectId);

    await this.translate(urn, input.filename, input.outputFormat ?? 'svf2');
    const manifest = await this.waitForTranslation(urn);

    if (manifest.status !== 'success' && manifest.status !== 'inprogress') {
      return { urn, status: manifest.status, objectCount: 0, counts: emptyCounts(), categories: {} };
    }

    const guids = await this.getViewableGuids(urn);
    const objects = await this.collectProperties(urn, guids);
    const { counts, categories } = countByCategory(objects);

    this.logger.log(
      `APS import ${input.filename}: ${objects.length} object(s), ` +
        `${totalElements(counts)} governed element(s), status=${manifest.status}.`,
    );

    return { urn, status: manifest.status, objectCount: objects.length, counts, categories };
  }

  // ───────────────────────── APS HTTP primitives ─────────────────────────

  private async getTokenRecord(scopes: string[]): Promise<{ token: string; expiresAt: number }> {
    const key = scopes.join(' ');
    const cached = this.tokenCache.get(key);
    if (cached && cached.expiresAt - Date.now() > 60_000) return cached;

    const creds = this.resolveCredentials();
    if (!creds) throw new ServiceUnavailableException('Autodesk APS credentials are not configured.');

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      scope: key,
    });
    const res = await fetch(`${this.config.baseUrl}/authentication/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new Error(`APS auth failed (${res.status}): ${await safeText(res)}`);
    }
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new Error('APS auth returned no access_token.');
    const record = {
      token: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
    this.tokenCache.set(key, record);
    return record;
  }

  private async getToken(scopes: string[]): Promise<string> {
    return (await this.getTokenRecord(scopes)).token;
  }

  private async ensureBucket(bucketKey: string): Promise<void> {
    const token = await this.getToken(DATA_SCOPES);
    const res = await fetch(`${this.config.baseUrl}/oss/v2/buckets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bucketKey, policyKey: 'transient' }),
    });
    // 409 = bucket already exists (and is ours) — that's success for our purpose.
    if (res.ok || res.status === 409) return;
    throw new Error(`APS bucket create failed (${res.status}): ${await safeText(res)}`);
  }

  /** Direct-to-S3 signed upload (OSS v2). Single-part for our model sizes. */
  private async uploadObject(bucketKey: string, objectKey: string, buffer: Buffer): Promise<string> {
    const token = await this.getToken(DATA_SCOPES);
    const signRes = await fetch(
      `${this.config.baseUrl}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(objectKey)}/signeds3upload`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!signRes.ok) throw new Error(`APS signed-upload request failed (${signRes.status}): ${await safeText(signRes)}`);
    const signed = (await signRes.json()) as { uploadKey?: string; urls?: string[] };
    if (!signed.uploadKey || !signed.urls?.length) throw new Error('APS signed-upload returned no urls.');

    const put = await fetch(signed.urls[0], { method: 'PUT', body: new Uint8Array(buffer) });
    if (!put.ok) throw new Error(`APS S3 upload failed (${put.status}): ${await safeText(put)}`);

    const finishRes = await fetch(
      `${this.config.baseUrl}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(objectKey)}/signeds3upload`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadKey: signed.uploadKey }),
      },
    );
    if (!finishRes.ok) throw new Error(`APS upload finalize failed (${finishRes.status}): ${await safeText(finishRes)}`);
    const finished = (await finishRes.json()) as { objectId?: string };
    if (!finished.objectId) throw new Error('APS upload finalize returned no objectId.');
    return finished.objectId;
  }

  private async translate(urn: string, filename: string, format: DerivativeFormat = 'svf2'): Promise<void> {
    const token = await this.getToken(DATA_SCOPES);
    const rootFilename = filename.toLowerCase().endsWith('.zip') ? filename : undefined;
    // svf2 carries 2d/3d views (the viewer + property tree the QS counts read);
    // ifc is a model-export format and takes no `views`.
    const outputFormat =
      format === 'ifc'
        ? { type: 'ifc' as const }
        : { type: 'svf2' as const, views: ['2d', '3d'] };
    const res = await fetch(`${this.config.baseUrl}/modelderivative/v2/designdata/job`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-ads-force': 'true',
      },
      body: JSON.stringify({
        input: { urn, ...(rootFilename ? { rootFilename, compressedUrn: true } : {}) },
        output: { formats: [outputFormat] },
      }),
    });
    if (!res.ok) throw new Error(`APS translation job failed (${res.status}): ${await safeText(res)}`);
  }

  private async getManifest(urn: string): Promise<{ status: AutodeskImportResult['status']; progress: string }> {
    const token = await this.getToken(DATA_SCOPES);
    const res = await fetch(`${this.config.baseUrl}/modelderivative/v2/designdata/${urn}/manifest`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) return { status: 'pending', progress: '0% (queued)' };
    if (!res.ok) throw new Error(`APS manifest read failed (${res.status}): ${await safeText(res)}`);
    const json = (await res.json()) as { status?: string; progress?: string };
    return { status: normalizeStatus(json.status), progress: json.progress ?? '' };
  }

  private async waitForTranslation(urn: string): Promise<{ status: AutodeskImportResult['status'] }> {
    const deadline = Date.now() + TRANSLATE_TIMEOUT_MS;
    let last: AutodeskImportResult['status'] = 'pending';
    while (Date.now() < deadline) {
      const m = await this.getManifest(urn);
      last = m.status;
      if (m.status === 'success' || m.status === 'failed' || m.status === 'timeout') return { status: m.status };
      await sleep(POLL_INTERVAL_MS);
    }
    // Translation still running when our budget elapsed — caller can re-poll the
    // manifest later via the URN; we report what we last saw, not a failure.
    return { status: last === 'pending' || last === 'inprogress' ? 'inprogress' : last };
  }

  private async getViewableGuids(urn: string): Promise<string[]> {
    const token = await this.getToken(DATA_SCOPES);
    const res = await fetch(`${this.config.baseUrl}/modelderivative/v2/designdata/${urn}/metadata`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`APS metadata read failed (${res.status}): ${await safeText(res)}`);
    const json = (await res.json()) as { data?: { metadata?: Array<{ guid?: string; role?: string }> } };
    const all = json.data?.metadata ?? [];
    // Prefer 3d viewables (they carry the model property tree); fall back to all.
    const threeD = all.filter((m) => m.role === '3d' && m.guid).map((m) => m.guid as string);
    return threeD.length ? threeD : all.filter((m) => m.guid).map((m) => m.guid as string);
  }

  private async collectProperties(urn: string, guids: string[]): Promise<ApsObject[]> {
    const token = await this.getToken(DATA_SCOPES);
    const out: ApsObject[] = [];
    for (const guid of guids) {
      const res = await fetch(
        `${this.config.baseUrl}/modelderivative/v2/designdata/${urn}/metadata/${guid}/properties?forceget=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status === 202) {
        // Properties still extracting — give it one more poll cycle.
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      if (!res.ok) {
        this.logger.warn(`APS properties read failed for guid ${guid} (${res.status}).`);
        continue;
      }
      const json = (await res.json()) as { data?: { collection?: ApsObject[] } };
      out.push(...(json.data?.collection ?? []));
    }
    return out;
  }

  private defaultBucketKey(): string {
    // Bucket keys are global + immutable; derive a stable, lower-case key from
    // the client id so two tenants never collide.
    const creds = this.resolveCredentials();
    const seed = (creds?.clientId ?? 'sigma').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
    return `sigmapmo${seed}`;
  }
}

// ───────────────────────── module-local helpers/types ─────────────────────────

/** Model Derivative output format: the viewer/counts default, or IFC export. */
export type DerivativeFormat = 'svf2' | 'ifc';

interface AutodeskConfigResolved {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}

export interface AutodeskStatus {
  enabled: boolean;
  credentialSource: 'db' | 'env' | 'none';
  /** UI-friendly view of `credentialSource`: 'settings' (encrypted DB), 'env', or null. */
  configuredVia: 'settings' | 'env' | null;
  baseUrl: string;
  /** Exact server-side env vars this Model Derivative pipeline needs. No secrets are returned. */
  requiredEnv: string[];
  /** null when not probed; true/false after a live token probe. */
  reachable: boolean | null;
  detail: string | null;
}

export interface AutodeskImportResult {
  urn: string;
  status: 'pending' | 'inprogress' | 'success' | 'failed' | 'timeout';
  objectCount: number;
  counts: BimCounts;
  /** Raw element-category histogram (Revit/IFC category → instance count). */
  categories: Record<string, number>;
}

interface ApsObject {
  objectid?: number;
  name?: string;
  properties?: Record<string, unknown>;
}

const VIEWER_SCOPES = ['viewables:read'];
const DATA_SCOPES = ['data:read', 'data:write', 'data:create', 'bucket:create', 'bucket:read'];
const TRANSLATE_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 4_000;
/**
 * The ONLY server-side env vars the Model Derivative (2-legged client-
 * credentials) pipeline requires. `AUTODESK_BASE_URL` is optional (defaults to
 * the public cloud). No callback URL / 3-legged scope vars are needed here —
 * those are only relevant to a browser SSO flow, which this connector avoids.
 */
const REQUIRED_ENV = ['AUTODESK_CLIENT_ID', 'AUTODESK_CLIENT_SECRET'];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 400);
  } catch {
    return '<no body>';
  }
}

function sanitizeObjectKey(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  return base.replace(/[^A-Za-z0-9._-]/g, '_');
}

/** Base64url(objectId) without padding — the Model Derivative URN form. */
function toUrn(objectId: string): string {
  return Buffer.from(objectId, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function normalizeStatus(status: string | undefined): AutodeskImportResult['status'] {
  switch ((status ?? '').toLowerCase()) {
    case 'success':
      return 'success';
    case 'failed':
      return 'failed';
    case 'timeout':
      return 'timeout';
    case 'inprogress':
    case 'pending':
      return 'inprogress';
    default:
      return 'pending';
  }
}

function emptyCounts(): BimCounts {
  return { walls: 0, slabs: 0, columns: 0, beams: 0, doors: 0, windows: 0, spaces: 0, storeys: 0 };
}

function totalElements(c: BimCounts): number {
  return c.walls + c.slabs + c.columns + c.beams + c.doors + c.windows + c.spaces;
}

/**
 * Map an APS property object's element category to one of the eight governed
 * `BimCounts` families. Works for both Revit categories ("Walls", "Floors",
 * "Structural Columns", "Structural Framing", "Doors", "Windows", "Rooms",
 * "Levels") and IFC entity names ("IfcWall", "IfcSlab", …).
 */
function categoryOf(obj: ApsObject): { bucket: keyof BimCounts | null; label: string } {
  const props = obj.properties ?? {};
  const raw =
    pickString(props, ['Category', 'Revit Category', 'IfcEntity', 'Type', 'Element Type']) ??
    obj.name ??
    '';
  const c = raw.toLowerCase();
  if (!c) return { bucket: null, label: '' };
  if (c.includes('wall')) return { bucket: 'walls', label: raw };
  if (c.includes('floor') || c.includes('slab')) return { bucket: 'slabs', label: raw };
  if (c.includes('column')) return { bucket: 'columns', label: raw };
  if (c.includes('beam') || c.includes('framing')) return { bucket: 'beams', label: raw };
  if (c.includes('door')) return { bucket: 'doors', label: raw };
  if (c.includes('window')) return { bucket: 'windows', label: raw };
  if (c.includes('room') || c.includes('space')) return { bucket: 'spaces', label: raw };
  if (c.includes('level') || c.includes('storey') || c.includes('story') || c.includes('building storey'))
    return { bucket: 'storeys', label: raw };
  return { bucket: null, label: raw };
}

function pickString(props: Record<string, unknown>, keys: string[]): string | null {
  // APS nests categories under a "Properties"/group map sometimes; check both
  // the flat keys and one level of nested record values.
  for (const k of keys) {
    const v = props[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  for (const v of Object.values(props)) {
    if (v && typeof v === 'object') {
      const nested = pickString(v as Record<string, unknown>, keys);
      if (nested) return nested;
    }
  }
  return null;
}

function countByCategory(objects: ApsObject[]): { counts: BimCounts; categories: Record<string, number> } {
  const counts = emptyCounts();
  const categories: Record<string, number> = {};
  for (const obj of objects) {
    const { bucket, label } = categoryOf(obj);
    if (label) categories[label] = (categories[label] ?? 0) + 1;
    if (bucket) counts[bucket] += 1;
  }
  return { counts, categories };
}
