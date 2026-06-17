import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppConfiguration, S3Config } from '../../../config/configuration';

/**
 * Immutable, content-addressed (SHA-256) file archive. By default it writes to
 * the local disk under a sharded tree; when S3 is configured (`s3.enabled`) it
 * stores the same sharded key on S3 / an S3-compatible bucket instead. The
 * `archive()`/`read()` contract is unchanged, so every caller (ingestion, BIM,
 * drawings, PDFs) is storage-agnostic. A storedPath is either an absolute local
 * path or an `s3://<bucket>/<key>` URI; `read()` dispatches on the prefix.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly storageDir: string;
  private readonly s3: S3Config;
  private s3Client: S3Client | null = null;

  constructor(config: ConfigService<AppConfiguration, true>) {
    const configured = (config.get<string>('storageDir') ?? '../data/storage') as string;
    this.storageDir = resolve(process.cwd(), configured);
    this.s3 = config.get('s3', { infer: true }) as S3Config;
    if (this.s3?.enabled) {
      this.logger.log(`File archive on S3 bucket "${this.s3.bucket}" (${this.s3.endpoint || 'aws'}).`);
    }
  }

  sha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private client(): S3Client {
    if (!this.s3Client) {
      this.s3Client = new S3Client({
        region: this.s3.region,
        endpoint: this.s3.endpoint || undefined,
        forcePathStyle: this.s3.forcePathStyle,
        credentials: { accessKeyId: this.s3.accessKeyId, secretAccessKey: this.s3.secretAccessKey },
      });
    }
    return this.s3Client;
  }

  private key(filename: string, sha256: string): string {
    const safeName = filename.replace(/[^\w.\-]+/g, '_');
    return `${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}__${safeName}`;
  }

  /** Archive the file content-addressed by SHA-256 (idempotent). */
  async archive(filename: string, buffer: Buffer, sha256: string): Promise<string> {
    if (this.s3?.enabled) {
      const key = this.key(filename, sha256);
      await this.client().send(
        new PutObjectCommand({ Bucket: this.s3.bucket, Key: key, Body: buffer }),
      );
      return `s3://${this.s3.bucket}/${key}`;
    }
    // Local disk (default).
    const dir = join(this.storageDir, sha256.slice(0, 2), sha256.slice(2, 4));
    await fs.mkdir(dir, { recursive: true });
    const safeName = filename.replace(/[^\w.\-]+/g, '_');
    const target = join(dir, `${sha256}__${safeName}`);
    try {
      await fs.writeFile(target, buffer, { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    return target;
  }

  /** Read back an archived file by the storedPath `archive()` returned. */
  async read(storedPath: string): Promise<Buffer> {
    if (storedPath.startsWith('s3://')) {
      const without = storedPath.slice('s3://'.length);
      const slash = without.indexOf('/');
      const bucket = without.slice(0, slash);
      const key = without.slice(slash + 1);
      const res = await this.client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await (res.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray();
      return Buffer.from(bytes);
    }
    const resolved = resolve(storedPath);
    if (!resolved.startsWith(this.storageDir)) {
      throw new Error('StorageService.read: path is outside the archive root');
    }
    return fs.readFile(resolved);
  }
}
