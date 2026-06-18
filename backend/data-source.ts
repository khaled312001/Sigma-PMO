/**
 * Standalone TypeORM DataSource for migrations (production cutover replaces
 * `synchronize: true`). Configured from env, identical to the runtime
 * connection so generated migrations target the same schema.
 *
 *   npm run migration:generate -- src/migrations/Init
 *   npm run migration:run
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

loadEnv();

const port = Number.parseInt(process.env.DB_PORT ?? '3306', 10);

export default new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number.isFinite(port) ? port : 3306,
  username: process.env.DB_USERNAME ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'sigma_pmo',
  charset: 'utf8mb4',
  timezone: 'Z',
  // Load EVERY entity file (mirrors the app's runtime `autoLoadEntities: true`),
  // not just the curated CANONICAL_ENTITIES barrel — module-owned entities
  // (Source, OutboxEvent, Letter, OrgChartReview) aren't in the barrel, so a
  // barrel-only list would silently drop their tables from generated migrations.
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
});
