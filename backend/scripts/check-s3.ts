/**
 * S3 / Cloudflare-R2 connectivity check — proves the configured bucket is
 * reachable and read/write/delete works end-to-end. Reads ONLY from env
 * (S3_ENDPOINT / S3_REGION / S3_BUCKET / S3_ACCESS_KEY / S3_SECRET_KEY /
 * S3_FORCE_PATH_STYLE) — no secrets live in this file. Safe to run on the
 * production server too:
 *
 *   cd backend && npx ts-node scripts/check-s3.ts
 *
 * It writes a tiny object under `sigma-pmo/connectivity-check/…`, reads it
 * back, verifies the bytes, lists the prefix, then deletes it (no residue).
 */
import { config as loadEnv } from 'dotenv';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

loadEnv();

function toBool(v: string | undefined, dflt: boolean): boolean {
  if (v === undefined || v === '') return dflt;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

async function main(): Promise<void> {
  const endpoint = process.env.S3_ENDPOINT ?? '';
  const region = process.env.S3_REGION ?? 'us-east-1';
  const bucket = process.env.S3_BUCKET ?? '';
  const accessKeyId = process.env.S3_ACCESS_KEY ?? '';
  const secretAccessKey = process.env.S3_SECRET_KEY ?? '';
  const forcePathStyle = toBool(process.env.S3_FORCE_PATH_STYLE, true);

  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('S3 not configured (need S3_BUCKET + S3_ACCESS_KEY + S3_SECRET_KEY).');
  }

  // Mask everything sensitive in output.
  console.log(`→ endpoint   : ${endpoint || '(aws default)'}`);
  console.log(`→ region     : ${region}`);
  console.log(`→ bucket     : ${bucket}`);
  console.log(`→ pathStyle  : ${forcePathStyle}`);
  console.log(`→ accessKey  : ${accessKeyId.slice(0, 4)}…${accessKeyId.slice(-2)} (masked)`);

  const client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
  });

  const stamp = `${Date.now()}-${process.pid}`;
  const key = `sigma-pmo/connectivity-check/${stamp}.txt`;
  const payload = Buffer.from(`sigma-pmo r2 connectivity ok @ ${stamp}\n`, 'utf8');

  // 1) WRITE
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: payload }));
  console.log(`✓ PutObject    → s3://${bucket}/${key}`);

  // 2) READ + verify bytes
  const got = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await (got.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray();
  const roundTrip = Buffer.from(bytes);
  if (!roundTrip.equals(payload)) {
    throw new Error(`Byte mismatch: wrote ${payload.length}B, read ${roundTrip.length}B`);
  }
  console.log(`✓ GetObject    → ${roundTrip.length} bytes, content matches`);

  // 3) LIST the prefix
  const list = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: 'sigma-pmo/connectivity-check/' }),
  );
  console.log(`✓ ListObjects  → ${list.KeyCount ?? 0} object(s) under prefix`);

  // 4) DELETE (cleanup — leave no residue in the bucket)
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  console.log(`✓ DeleteObject → cleaned up`);

  console.log('\n✅ R2 connectivity: PASS (write + read + verify + list + delete all OK)');
}

main().catch((err) => {
  console.error('\n❌ R2 connectivity: FAIL');
  console.error(`${(err as Error).name}: ${(err as Error).message}`);
  process.exit(1);
});
