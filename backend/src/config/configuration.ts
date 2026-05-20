/**
 * Typed application configuration, loaded from environment variables.
 * Safe local defaults are provided so the app boots in development; production
 * values come from the environment (Hostinger). See `.env.example`.
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  /** Auto-create/update schema from entities. DEV ONLY — never true in prod. */
  synchronize: boolean;
  logging: boolean;
}

export interface AppConfiguration {
  env: string;
  port: number;
  database: DatabaseConfig;
  /** Directory where ingested source files are archived immutably. */
  storageDir: string;
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default (): AppConfiguration => ({
  env: process.env.NODE_ENV ?? 'development',
  port: toInt(process.env.PORT, 3001),
  storageDir: process.env.STORAGE_DIR ?? '../data/storage',
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: toInt(process.env.DB_PORT, 3306),
    username: process.env.DB_USERNAME ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE ?? 'sigma_pmo',
    // Default true for zero-setup dev; MUST be false in production (migrations instead).
    synchronize: toBool(process.env.DB_SYNCHRONIZE, process.env.NODE_ENV !== 'production'),
    logging: toBool(process.env.DB_LOGGING, false),
  },
});
