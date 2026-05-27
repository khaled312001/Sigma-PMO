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

import { CANONICAL_ENTITIES } from './src/modules/canonical/entities';

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
  entities: CANONICAL_ENTITIES,
  migrations: ['src/migrations/*.ts'],
});
