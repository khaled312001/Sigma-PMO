/**
 * Upload the ENTIRE local file archive (STORAGE_DIR, default ../data/storage)
 * to R2 / S3 as a COMPLETE file backup — under the same sharded keys, beneath
 * the optional S3_PREFIX "system folder". Idempotent: objects that already
 * exist (HeadObject) are skipped, so it is safe to re-run any time.
 *
 * Reads ONLY env (S3_* + STORAGE_DIR) — no secrets in this file.
 *   cd backend && npx ts-node scripts/migrate-storage-to-s3.ts
 *
 * This complements scripts/backup-db-to-s3.ts (the data) — together they put
 * EVERYTHING (files + database) on R2. New uploads already land on R2 directly
 * once S3 is enabled; this catches everything written to local disk beforehand.
 */
import { config as loadEnv } from 'dotenv';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, relative, sep } from 'node:path';

import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

loadEnv();

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // missing dir → nothing to migrate
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

async function main(): Promise<void> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket || !process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) {
    throw new Error('S3 not configured — set S3_BUCKET / S3_ACCESS_KEY / S3_SECRET_KEY.');
  }
  const prefix = (process.env.S3_PREFIX ?? '').replace(/^\/+|\/+$/g, '');
  const storageDir = resolve(process.cwd(), process.env.STORAGE_DIR ?? '../data/storage');

  const s3 = new S3Client({
    region: process.env.S3_REGION ?? 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') !== 'false',
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
  });

  console.log(`→ source : ${storageDir}`);
  console.log(`→ target : s3://${bucket}/${prefix ? `${prefix}/` : ''}`);

  let uploaded = 0, skipped = 0, failed = 0, bytes = 0;
  for await (const file of walk(storageDir)) {
    const rel = relative(storageDir, file).split(sep).join('/');
    const key = `${prefix ? `${prefix}/` : ''}${rel}`;
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      skipped++;
      continue; // already on R2
    } catch { /* not found → upload */ }
    try {
      const buf = await readFile(file);
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buf }));
      uploaded++; bytes += buf.length;
      if (uploaded % 25 === 0) console.log(`  …uploaded ${uploaded} files (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
    } catch (e) {
      failed++;
      console.warn(`  FAILED ${rel}: ${(e as Error).message}`);
    }
  }

  console.log(`\n✅ storage sync done — uploaded ${uploaded}, skipped ${skipped} (already present), failed ${failed}; ${(bytes / 1024 / 1024).toFixed(2)} MB transferred.`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error('storage migration failed:', (e as Error).message);
  process.exit(1);
});
