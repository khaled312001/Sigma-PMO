/**
 * Database restore ← S3. Downloads a backup produced by `backup-db-to-s3.ts`,
 * decrypts it (AES-256-GCM) when it ends in `.enc`, gunzips it, and pipes the
 * SQL into `mysql` for the configured database. DESTRUCTIVE — it overwrites the
 * target database, so it requires an explicit confirmation flag.
 *
 *   # list available backups
 *   npx ts-node scripts/restore-db-from-s3.ts --list
 *   # restore the most recent backup into DB_DATABASE (must pass --yes)
 *   npx ts-node scripts/restore-db-from-s3.ts --latest --yes
 *   # restore a specific object
 *   npx ts-node scripts/restore-db-from-s3.ts --key db-backups/sigma_pmo-2026-...sql.gz.enc --yes
 *   # restore into a different (scratch) DB to verify a backup without risk
 *   npx ts-node scripts/restore-db-from-s3.ts --latest --into sigma_restore_check --yes
 *
 * Reads DB_* + S3_* + BACKUP_ENCRYPTION_KEY from the environment (.env).
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { createDecipheriv } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1]?.startsWith('--') ? '' : process.argv[i + 1]) : undefined;
}
const has = (name: string): boolean => process.argv.includes(`--${name}`);

function backupKey(): Buffer | null {
  const raw = process.env.BACKUP_ENCRYPTION_KEY;
  if (!raw) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must be 32 bytes (64 hex / base64).');
  return buf;
}

/** Reverse of backup encrypt(): [12-byte iv][16-byte authTag][ciphertext]. */
function decrypt(data: Buffer, key: Buffer): Buffer {
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const ct = data.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

async function main(): Promise<void> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket || !process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) {
    throw new Error('S3 not configured — set S3_BUCKET / S3_ACCESS_KEY / S3_SECRET_KEY.');
  }
  const s3 = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') !== 'false',
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! },
  });

  const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'db-backups/' }));
  const objs = (list.Contents ?? [])
    .filter((o) => o.Key)
    .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));

  if (has('list') || (!has('latest') && !arg('key'))) {
    console.log(`Backups in s3://${bucket}/db-backups/ (newest first):`);
    objs.forEach((o) => console.log(`  ${o.Key}\t${((o.Size ?? 0) / 1024 / 1024).toFixed(2)} MB\t${o.LastModified?.toISOString()}`));
    if (!has('list')) console.log('\nPass --latest --yes  or  --key <key> --yes  to restore (DESTRUCTIVE).');
    return;
  }

  const key = arg('key') || objs[0]?.Key;
  if (!key) throw new Error('No backup found to restore.');
  const target = arg('into') || process.env.DB_DATABASE || 'sigma_pmo';

  if (!has('yes')) {
    throw new Error(`Refusing to overwrite "${target}" without --yes. Re-run with --yes to confirm (DESTRUCTIVE).`);
  }

  console.log(`[1/3] downloading ${key} …`);
  const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  let buf = await streamToBuffer(obj.Body);

  if (key.endsWith('.enc')) {
    const k = backupKey();
    if (!k) throw new Error('Backup is encrypted (.enc) but BACKUP_ENCRYPTION_KEY is not set.');
    console.log('[2/3] decrypting (AES-256-GCM) + gunzip …');
    buf = decrypt(buf, k);
  } else {
    console.log('[2/3] gunzip …');
  }
  const sql = gunzipSync(buf);

  console.log(`[3/3] restoring into "${target}" …`);
  const args = [
    '-h', process.env.DB_HOST ?? 'localhost',
    '-P', process.env.DB_PORT ?? '3306',
    '-u', process.env.DB_USERNAME ?? 'root',
    ...(process.env.DB_PASSWORD ? [`-p${process.env.DB_PASSWORD}`] : []),
    target,
  ];
  const res = spawnSync('mysql', args, { input: sql, maxBuffer: 1024 * 1024 * 1024 });
  if (res.status !== 0) {
    throw new Error(`mysql restore failed (${res.status}): ${res.stderr?.toString().slice(0, 400)}`);
  }
  console.log(`Restore complete — "${target}" now matches ${key}.`);
}

main().catch((e) => {
  console.error('restore failed:', (e as Error).message);
  process.exit(1);
});
