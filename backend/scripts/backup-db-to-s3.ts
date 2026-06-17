/**
 * Database backup → S3. Runs `mysqldump` on the configured database, gzips the
 * dump, uploads it to `db-backups/<db>-<timestamp>.sql.gz` on the S3 bucket, and
 * prunes old backups beyond BACKUP_RETENTION (default 14). Reads DB_* + S3_* from
 * the environment (.env). Run: `npx ts-node scripts/backup-db-to-s3.ts`
 * (schedule via cron / Task Scheduler). Restore: `gunzip -c dump.sql.gz | mysql <db>`.
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

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
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `db-backups/${DB_DATABASE}-${ts}.sql.gz`;

  const s3 = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') !== 'false',
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
  });

  console.log(`[2/3] uploading ${key} (${(gz.length / 1024 / 1024).toFixed(2)} MB) …`);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: gz, ContentType: 'application/gzip' }));

  const retain = Number(process.env.BACKUP_RETENTION ?? 14);
  const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'db-backups/' }));
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
