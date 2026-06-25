/**
 * Database backup → S3. Runs `mysqldump` on the configured database, gzips the
 * dump, OPTIONALLY encrypts it (AES-256-GCM, client-side) when
 * `BACKUP_ENCRYPTION_KEY` is set, uploads it to
 * `db-backups/<db>-<timestamp>.sql.gz[.enc]` on the S3 bucket, and prunes old
 * backups beyond BACKUP_RETENTION (default 14). Reads DB_* + S3_* + BACKUP_* from
 * the environment (.env). Run: `npx ts-node scripts/backup-db-to-s3.ts`
 * (schedule via cron / Task Scheduler — see docs/BACKUP-RESTORE.md).
 * Restore with `scripts/restore-db-from-s3.ts`.
 *
 * Security: the dump contains EVERY tenant's data. Set `BACKUP_ENCRYPTION_KEY`
 * (32-byte key, hex or base64) so the object is encrypted before it leaves this
 * host; optionally set `S3_SSE=AES256` for server-side-at-rest encryption too.
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { createCipheriv, randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type ServerSideEncryption,
} from '@aws-sdk/client-s3';

/** Parse a 32-byte key from hex or base64 (or null when unset → no encryption). */
function backupKey(): Buffer | null {
  const raw = process.env.BACKUP_ENCRYPTION_KEY;
  if (!raw) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64). Generate: openssl rand -hex 32');
  }
  return buf;
}

/** AES-256-GCM. Output layout: [12-byte iv][16-byte authTag][ciphertext]. */
function encrypt(data: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

async function main(): Promise<void> {
  const DB_HOST = process.env.DB_HOST ?? 'localhost';
  const DB_PORT = process.env.DB_PORT ?? '3306';
  const DB_USERNAME = process.env.DB_USERNAME ?? 'root';
  const DB_PASSWORD = process.env.DB_PASSWORD ?? '';
  const DB_DATABASE = process.env.DB_DATABASE ?? 'sigma_pmo';

  const bucket = process.env.S3_BUCKET;
  if (!bucket || !process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) {
    throw new Error('S3 not configured — set S3_BUCKET / S3_ACCESS_KEY / S3_SECRET_KEY.');
  }

  console.log(`[1/3] mysqldump ${DB_DATABASE} @ ${DB_HOST}:${DB_PORT} …`);
  const args = [
    '-h', DB_HOST, '-P', DB_PORT, '-u', DB_USERNAME,
    ...(DB_PASSWORD ? [`-p${DB_PASSWORD}`] : []),
    '--single-transaction', '--quick', '--routines', '--events', '--no-tablespaces',
    DB_DATABASE,
  ];
  const dump = spawnSync('mysqldump', args, { maxBuffer: 1024 * 1024 * 1024 });
  if (dump.status !== 0) {
    throw new Error(`mysqldump failed (${dump.status}): ${dump.stderr?.toString().slice(0, 400)}`);
  }
  const gz = gzipSync(dump.stdout);
  const encKey = backupKey();
  const body = encKey ? encrypt(gz, encKey) : gz;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  // Optional system folder (S3_PREFIX) — keeps every system's files + backups together.
  const prefix = (process.env.S3_PREFIX ?? '').replace(/^\/+|\/+$/g, '');
  const backupDir = `${prefix ? `${prefix}/` : ''}db-backups/`;
  const key = `${backupDir}${DB_DATABASE}-${ts}.sql.gz${encKey ? '.enc' : ''}`;

  const s3 = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') !== 'false',
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
  });

  const sse = process.env.S3_SSE as ServerSideEncryption | undefined; // e.g. 'AES256' on AWS
  console.log(`[2/3] uploading ${key} (${(body.length / 1024 / 1024).toFixed(2)} MB${encKey ? ', AES-256-GCM encrypted' : ''}) …`);
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: encKey ? 'application/octet-stream' : 'application/gzip',
    ...(sse ? { ServerSideEncryption: sse } : {}),
  }));

  const retain = Number(process.env.BACKUP_RETENTION ?? 14);
  const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: backupDir }));
  const objs = (list.Contents ?? [])
    .filter((o) => o.Key)
    .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));
  const old = objs.slice(retain);
  if (old.length) {
    await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: old.map((o) => ({ Key: o.Key! })) } }));
  }
  console.log(`[3/3] done — kept ${Math.min(objs.length, retain)} backup(s), pruned ${old.length}.`);
}

main().catch((e) => {
  console.error('backup failed:', (e as Error).message);
  process.exit(1);
});
