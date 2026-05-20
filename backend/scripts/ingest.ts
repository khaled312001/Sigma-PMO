/**
 * CLI to ingest a file into the database through the full pipeline. Requires a
 * configured MySQL connection (local or Hostinger). This is the command behind
 * the Cycle 1 acceptance once the database is connected.
 *
 * Run:  npm run ingest -- <path-to-file>
 */
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { IngestionService } from '../src/modules/ingestion/ingestion.service';

/* eslint-disable no-console */

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: npm run ingest -- <path-to-file>');
    process.exitCode = 1;
    return;
  }

  const path = resolve(process.cwd(), arg);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const ingestion = app.get(IngestionService);
    const buffer = readFileSync(path);
    const outcome = await ingestion.ingest(basename(path), buffer);
    Logger.log(
      `Ingested ${basename(path)} -> run ${outcome.runId} [${outcome.status}] ` +
        `counts=${JSON.stringify(outcome.counts)}`,
      'Ingest',
    );
  } finally {
    await app.close();
  }
}

void main();
