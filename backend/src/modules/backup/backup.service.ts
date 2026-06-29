import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type ServerSideEncryption,
} from '@aws-sdk/client-s3';
import { createConnection } from 'mysql2/promise';

import type { AppConfiguration, DatabaseConfig, S3Config } from '../../config/configuration';

export interface BackupResult {
  ok: boolean;
  skipped?: string;
  key?: string;
  bytes?: number;
  tables?: number;
  rows?: number;
  encrypted?: boolean;
  durationMs?: number;
  error?: string;
}

export interface RestoreVerifyResult {
  backupKey: string;
  sizeBytes: number;
  tables: number;
  rows: number;
  durationMs: number;
  scratchSchema: string;
  note: string;
}

/**
 * Automatic, self-contained database backup to R2 / S3. A pure-`mysql2` logical
 * dump (no `mysqldump` binary needed → works inside the lean runtime image and
 * with MySQL 8.4 `caching_sha2_password`), gzipped, optionally AES-256-GCM
 * encrypted (BACKUP_ENCRYPTION_KEY), uploaded under `<S3_PREFIX>/db-backups/`,
 * and pruned to BACKUP_RETENTION. Runs nightly via @Cron and on-demand from the
 * super-admin console. File objects already live on R2 (StorageService), so the
 * two together back up EVERYTHING — files + data.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private running = false;

  constructor(private readonly config: ConfigService<AppConfiguration, true>) {}

  private s3cfg(): S3Config {
    return this.config.get('s3', { infer: true });
  }

  private s3client(s3: S3Config): S3Client {
    return new S3Client({
      region: s3.region || 'auto',
      endpoint: s3.endpoint || undefined,
      forcePathStyle: s3.forcePathStyle,
      credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
    });
  }

  private backupDir(s3: S3Config): string {
    return `${s3.prefix ? `${s3.prefix}/` : ''}db-backups/`;
  }

  /** 32-byte AES key from BACKUP_ENCRYPTION_KEY (hex or base64), or null = no encryption. */
  private encKey(): Buffer | null {
    const raw = process.env.BACKUP_ENCRYPTION_KEY;
    if (!raw) return null;
    const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (buf.length !== 32) {
      throw new Error('BACKUP_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64).');
    }
    return buf;
  }

  /** AES-256-GCM → [12B iv][16B tag][ciphertext]. */
  private encrypt(data: Buffer, key: Buffer): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(data), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), enc]);
  }

  /** Reverse of encrypt() — [12B iv][16B tag][ciphertext] AES-256-GCM. */
  private decrypt(blob: Buffer, key: Buffer): Buffer {
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(12, 28);
    const ciphertext = blob.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'db-backup' })
  async scheduled(): Promise<void> {
    const r = await this.runBackup();
    if (r.skipped) this.logger.log(`Nightly backup skipped: ${r.skipped}`);
    else if (r.ok) this.logger.log(`Nightly backup ok → ${r.key} (${((r.bytes ?? 0) / 1024 / 1024).toFixed(2)} MB).`);
    else this.logger.error(`Nightly backup FAILED: ${r.error}`);
  }

  /** Produce a complete logical dump (DDL + data) of every base table as SQL text. */
  private async dump(db: DatabaseConfig): Promise<{ sql: Buffer; tables: number; rows: number }> {
    const conn = await createConnection({
      host: db.host, port: db.port, user: db.username, password: db.password, database: db.database,
      dateStrings: true,
      // JSON columns as raw UTF-8 text (not parsed objects) so they re-insert cleanly
      // AND non-ASCII (Arabic) content is preserved byte-for-byte. field.string()
      // without an encoding decodes JSON as BINARY → would corrupt UTF-8.
      typeCast: (field, next) => (field.type === 'JSON' ? field.string('utf8') : next()),
    });
    try {
      const out: string[] = [
        `-- Sigma PMO logical backup of \`${db.database}\``,
        'SET FOREIGN_KEY_CHECKS=0;',
        'SET NAMES utf8mb4;',
        '',
      ];
      const [tables] = await conn.query<any[]>(
        "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
        [db.database],
      );
      let rowCount = 0;
      for (const { t } of tables) {
        const [[created]] = await conn.query<any[]>(`SHOW CREATE TABLE \`${t}\``);
        out.push(`DROP TABLE IF EXISTS \`${t}\`;`, `${created['Create Table']};`, '');
        const [rows] = await conn.query<any[]>(`SELECT * FROM \`${t}\``);
        if (rows.length) {
          const cols = Object.keys(rows[0]).map((c) => `\`${c}\``).join(',');
          for (const row of rows) {
            const vals = Object.values(row).map((v) => this.escape(conn, v)).join(',');
            out.push(`INSERT INTO \`${t}\` (${cols}) VALUES (${vals});`);
          }
          rowCount += rows.length;
          out.push('');
        }
      }
      out.push('SET FOREIGN_KEY_CHECKS=1;', '');
      return { sql: Buffer.from(out.join('\n'), 'utf8'), tables: tables.length, rows: rowCount };
    } finally {
      await conn.end();
    }
  }

  /** Safely render a value for an INSERT (handles null, Buffer/BLOB, JSON text, dates-as-strings). */
  private escape(conn: { escape(v: unknown): string }, v: unknown): string {
    if (v === null || v === undefined) return 'NULL';
    if (Buffer.isBuffer(v)) return conn.escape(v); // → X'..' hex literal
    if (typeof v === 'object') return conn.escape(JSON.stringify(v)); // defensive; JSON already text via typeCast
    return conn.escape(v);
  }

  /** Run one backup now. Safe to call from @Cron or the super-admin endpoint. */
  async runBackup(): Promise<BackupResult> {
    const s3 = this.s3cfg();
    if (!s3?.enabled) return { ok: false, skipped: 'S3 not configured (set S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY).' };
    if (this.running) return { ok: false, skipped: 'a backup is already running' };
    this.running = true;
    const started = Date.now();
    try {
      const db = this.config.get('database', { infer: true });
      const { sql, tables, rows } = await this.dump(db);
      const gz = gzipSync(sql);
      const key = this.encKey();
      const body = key ? this.encrypt(gz, key) : gz;
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const objectKey = `${this.backupDir(s3)}${db.database}-${ts}.sql.gz${key ? '.enc' : ''}`;

      const client = this.s3client(s3);
      const sse = process.env.S3_SSE as ServerSideEncryption | undefined;
      await client.send(new PutObjectCommand({
        Bucket: s3.bucket, Key: objectKey, Body: body,
        ContentType: key ? 'application/octet-stream' : 'application/gzip',
        ...(sse ? { ServerSideEncryption: sse } : {}),
      }));

      // Prune beyond retention.
      const retain = Number(process.env.BACKUP_RETENTION ?? 14);
      const list = await client.send(new ListObjectsV2Command({ Bucket: s3.bucket, Prefix: this.backupDir(s3) }));
      const objs = (list.Contents ?? []).filter((o) => o.Key)
        .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));
      const old = objs.slice(retain);
      if (old.length) {
        await client.send(new DeleteObjectsCommand({ Bucket: s3.bucket, Delete: { Objects: old.map((o) => ({ Key: o.Key! })) } }));
      }

      return { ok: true, key: objectKey, bytes: body.length, tables, rows, encrypted: !!key, durationMs: Date.now() - started };
    } catch (e) {
      this.logger.error(`Backup failed: ${(e as Error).message}`);
      return { ok: false, error: (e as Error).message, durationMs: Date.now() - started };
    } finally {
      this.running = false;
    }
  }

  /**
   * One-time (idempotent) sync of the local file archive → R2, so files written
   * to disk BEFORE S3 was enabled are also backed up. New uploads already go
   * straight to R2 via StorageService. Safe to re-run; existing objects skipped.
   */
  async migrateLocalStorage(): Promise<{ ok: boolean; uploaded: number; skipped: number; failed: number; mb: number; skippedReason?: string }> {
    const s3 = this.s3cfg();
    if (!s3?.enabled) return { ok: false, uploaded: 0, skipped: 0, failed: 0, mb: 0, skippedReason: 'S3 not configured' };
    const storageDir = resolve(process.cwd(), this.config.get('storageDir', { infer: true }) ?? '../data/storage');
    const client = this.s3client(s3);
    const prefix = s3.prefix ? `${s3.prefix}/` : '';
    let uploaded = 0, skipped = 0, failed = 0, bytes = 0;

    const walk = async (dir: string): Promise<void> => {
      let entries;
      try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { await walk(p); continue; }
        if (!e.isFile()) continue;
        const key = `${prefix}${relative(storageDir, p).split(sep).join('/')}`;
        try { await client.send(new HeadObjectCommand({ Bucket: s3.bucket, Key: key })); skipped++; continue; } catch { /* upload */ }
        try {
          const buf = await readFile(p);
          await client.send(new PutObjectCommand({ Bucket: s3.bucket, Key: key, Body: buf }));
          uploaded++; bytes += buf.length;
        } catch (err) { failed++; this.logger.warn(`storage sync failed for ${key}: ${(err as Error).message}`); }
      }
    };
    await walk(storageDir);
    this.logger.log(`Storage sync → R2: uploaded ${uploaded}, skipped ${skipped}, failed ${failed}.`);
    return { ok: failed === 0, uploaded, skipped, failed, mb: Number((bytes / 1024 / 1024).toFixed(2)) };
  }

  /** List the backups currently on R2 (newest first). */
  async listBackups(): Promise<{ enabled: boolean; bucket?: string; prefix?: string; backups: { key: string; sizeMB: number; lastModified?: string }[] }> {
    const s3 = this.s3cfg();
    if (!s3?.enabled) return { enabled: false, backups: [] };
    const client = this.s3client(s3);
    const list = await client.send(new ListObjectsV2Command({ Bucket: s3.bucket, Prefix: this.backupDir(s3) }));
    const backups = (list.Contents ?? []).filter((o) => o.Key)
      .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0))
      .map((o) => ({ key: o.Key!, sizeMB: Number(((o.Size ?? 0) / 1024 / 1024).toFixed(2)), lastModified: o.LastModified?.toISOString() }));
    return { enabled: true, bucket: s3.bucket, prefix: this.backupDir(s3), backups };
  }

  /**
   * Restore-verify (owner's "restore غير مثبت"): an API-callable proof that a
   * real backup restores into a THROWAWAY scratch schema (`<db>_restore_check`),
   * never touching the live DB. Downloads the chosen (or newest) backup, decrypts
   * (.enc) + gunzips → SQL, runs it in a fresh scratch database, counts the base
   * tables + total rows from information_schema, then drops the scratch schema.
   * The live `DB_DATABASE` is never selected or written.
   */
  async restoreVerify(key?: string): Promise<RestoreVerifyResult> {
    const s3 = this.s3cfg();
    if (!s3?.enabled) throw new BadRequestException('S3 not configured (set S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY).');
    if (this.running) throw new BadRequestException('a backup is already running; retry shortly');
    this.running = true;
    const started = Date.now();
    const client = this.s3client(s3);
    const db = this.config.get('database', { infer: true });
    const scratchSchema = `${db.database}_restore_check`;
    if (scratchSchema === db.database) throw new BadRequestException('scratch schema collides with the live database');

    try {
      // Resolve the backup object — explicit key, or the newest under db-backups/.
      let backupKey = key?.trim();
      if (!backupKey) {
        const list = await client.send(new ListObjectsV2Command({ Bucket: s3.bucket, Prefix: this.backupDir(s3) }));
        const newest = (list.Contents ?? []).filter((o) => o.Key)
          .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0))[0];
        if (!newest?.Key) throw new BadRequestException('no backups found on S3 to verify');
        backupKey = newest.Key;
      }

      // Download → decrypt (.enc) → gunzip → SQL text.
      const obj = await client.send(new GetObjectCommand({ Bucket: s3.bucket, Key: backupKey }));
      const downloaded = Buffer.from(await obj.Body!.transformToByteArray());
      let gz: Buffer = downloaded;
      if (backupKey.endsWith('.enc')) {
        const encKey = this.encKey();
        if (!encKey) throw new BadRequestException('backup is encrypted but BACKUP_ENCRYPTION_KEY is not set');
        gz = this.decrypt(downloaded, encKey);
      }
      const sql = gunzipSync(gz).toString('utf8');

      // SEPARATE connection with NO database selected; recreate the scratch schema.
      // multipleStatements lets us replay the dump in one round-trip.
      const conn = await createConnection({
        host: db.host, port: db.port, user: db.username, password: db.password,
        multipleStatements: true, dateStrings: true,
      });
      try {
        await conn.query(`DROP DATABASE IF EXISTS \`${scratchSchema}\``);
        await conn.query(`CREATE DATABASE \`${scratchSchema}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await conn.changeUser({ database: scratchSchema });
        await conn.query(sql);
        const [tableRows] = await conn.query<any[]>(
          "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
          [scratchSchema],
        );
        let rows = 0;
        for (const { t } of tableRows) {
          const [[c]] = await conn.query<any[]>(`SELECT COUNT(*) AS n FROM \`${t}\``);
          rows += Number(c.n) || 0;
        }
        const tables = tableRows.length;
        await conn.query(`DROP DATABASE \`${scratchSchema}\``);
        const durationMs = Date.now() - started;
        this.logger.log(`Restore-verify ok → ${backupKey}: ${tables} table(s), ${rows} row(s) into ${scratchSchema} (dropped) in ${durationMs}ms.`);
        return {
          backupKey, sizeBytes: downloaded.length, tables, rows, durationMs, scratchSchema,
          note: `Verified: backup restored into throwaway schema "${scratchSchema}" (then dropped); the live "${db.database}" was never written.`,
        };
      } finally {
        // Best-effort cleanup if the dump failed mid-way; ignore drop errors.
        try { await conn.query(`DROP DATABASE IF EXISTS \`${scratchSchema}\``); } catch { /* already gone */ }
        await conn.end();
      }
    } finally {
      this.running = false;
    }
  }
}
