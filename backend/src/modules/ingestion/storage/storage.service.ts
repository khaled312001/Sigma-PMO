import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Immutable source-file archive. Every ingested file is content-addressed by
 * SHA-256 and written once under a sharded directory tree, so the exact bytes
 * behind any ingestion run can always be retrieved (handover / audit).
 */
@Injectable()
export class StorageService {
  private readonly storageDir: string;

  constructor(config: ConfigService) {
    const configured = config.get<string>('storageDir') ?? '../data/storage';
    this.storageDir = resolve(process.cwd(), configured);
  }

  sha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  /** Archive the file under <storage>/<aa>/<bb>/<sha>__<name>; idempotent. */
  async archive(filename: string, buffer: Buffer, sha256: string): Promise<string> {
    const dir = join(this.storageDir, sha256.slice(0, 2), sha256.slice(2, 4));
    await fs.mkdir(dir, { recursive: true });
    const safeName = filename.replace(/[^\w.\-]+/g, '_');
    const target = join(dir, `${sha256}__${safeName}`);
    try {
      // 'wx' fails if the file already exists — preserves immutability.
      await fs.writeFile(target, buffer, { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    return target;
  }

  /**
   * Read back an archived file by the path `archive()` returned. Refuses any
   * path outside the archive root (defence against a tampered storedPath).
   */
  async read(storedPath: string): Promise<Buffer> {
    const resolved = resolve(storedPath);
    if (!resolved.startsWith(this.storageDir)) {
      throw new Error('StorageService.read: path is outside the archive root');
    }
    return fs.readFile(resolved);
  }
}
