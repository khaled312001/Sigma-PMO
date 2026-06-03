import { resolve } from 'node:path';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';

import { AppModule } from '../src/app.module';

/**
 * End-to-end test of the Cycle-1 acceptance criterion:
 *   "ingest sample P6 + Excel and verify normalised state."
 *
 * Uses a dedicated `sigma_pmo_e2e` test DB so it never touches dev data.
 * Requires MariaDB on 127.0.0.1:3306 with root/no-password (XAMPP default).
 */
describe('Ingestion (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    // Override DB before module compilation so DatabaseModule reads our test DB.
    process.env.NODE_ENV = 'development';
    process.env.DB_DATABASE = 'sigma_pmo_e2e';
    process.env.DB_SYNCHRONIZE = 'true';
    process.env.LOG_LEVEL = 'error';

    // Drop and recreate the test DB via a one-shot connection.
    const bootstrap = new DataSource({
      type: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      username: 'root',
      password: '',
      database: 'mysql',
    });
    await bootstrap.initialize();
    await bootstrap.query('DROP DATABASE IF EXISTS sigma_pmo_e2e');
    await bootstrap.query("CREATE DATABASE sigma_pmo_e2e CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    await bootstrap.destroy();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    dataSource = app.get(DataSource);
  }, 60_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (app) await app.close();
  }, 30_000);

  it('ingest-path → normalises P6 PMXML sample end-to-end', async () => {
    const sample = resolve(__dirname, '..', '..', 'data', 'samples', 'p6_schedule.xml');

    const res = await request(app.getHttpServer())
      .post('/api/v1/ingestion/ingest-path')
      .send({ path: sample })
      .expect(200);

    expect(res.body.status).toBe('normalized');
    expect(res.body.counts).toEqual({
      project: 1,
      resource: 4,
      activity: 8,
      report: 0,
      assignment: 6,
    });
    expect(res.body.confidence.overall).toBeGreaterThan(0.9);

    // Verify the audit row was persisted.
    const runs: { id: string; status: string }[] = await dataSource.query(
      'SELECT id, status FROM ingestion_run ORDER BY createdAt DESC LIMIT 1',
    );
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('normalized');
  });

  it('re-ingest of the same business keys creates a new version (append-only)', async () => {
    const sample = resolve(__dirname, '..', '..', 'data', 'samples', 'p6_schedule.xml');

    await request(app.getHttpServer())
      .post('/api/v1/ingestion/ingest-path')
      .send({ path: sample })
      .expect(200);

    // Project P-1000 should now have at least two versions, exactly one isCurrent=true.
    const versions: { version: number; isCurrent: number }[] = await dataSource.query(
      "SELECT version, isCurrent FROM project WHERE businessKey = 'P-1000' ORDER BY version DESC",
    );
    expect(versions.length).toBeGreaterThanOrEqual(2);
    const currentRows = versions.filter((v) => v.isCurrent === 1);
    expect(currentRows).toHaveLength(1);
    expect(currentRows[0].version).toBe(versions[0].version);
  });

  it('rule-engine evaluation produces alerts traceable to source rows', async () => {
    const evalRes = await request(app.getHttpServer())
      .post('/api/v1/rules/evaluate')
      .send({ projectKey: 'P-1000' })
      .expect(200);

    expect(evalRes.body.alertCount).toBeGreaterThan(0);
    const evaluationId = evalRes.body.evaluationId;

    const alertsRes = await request(app.getHttpServer())
      .get(`/api/v1/rules/alerts?evaluationId=${evaluationId}&limit=200`)
      .expect(200);

    expect(alertsRes.body.length).toBeGreaterThan(0);
    const sample = alertsRes.body[0];
    expect(sample.ingestionRunId).toBeTruthy();
    expect(sample.sourceFileId).toBeTruthy();

    // Evidence endpoint resolves the chain to the source file.
    const evRes = await request(app.getHttpServer())
      .get(`/api/v1/governance/alerts/${sample.id}/evidence`)
      .expect(200);

    expect(evRes.body.alert.id).toBe(sample.id);
    expect(evRes.body.sourceFile?.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evRes.body.confidence?.overall).toBeGreaterThan(0.5);
  });
});
