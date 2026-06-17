/**
 * Apply the Tenancy schema to the DEV database directly (dev runs with
 * DB_SYNCHRONIZE=false, and the migrations table is empty while tables already
 * exist, so `migration:run` can't be used here). Idempotent — skips
 * already-applied columns/tables/indexes. Mirrors migration 1787000000000-Tenancy.
 *   npx ts-node scripts/apply-tenancy-dev.ts
 */
import 'dotenv/config';
import { createConnection, Connection } from 'mysql2/promise';

const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';
const TRACEABLE = [
  'activity', 'enterprise', 'portfolio', 'program', 'project',
  'project_record', 'report', 'resource', 'resource_assignment',
];
const IGNORABLE = new Set([
  'ER_DUP_FIELDNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_DUP_KEYNAME', 'ER_DUP_ENTRY', 'ER_CANT_DROP_FIELD_OR_KEY',
]);

async function run(conn: Connection, sql: string, params?: unknown[]): Promise<void> {
  try {
    await conn.query(sql, params);
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    if (IGNORABLE.has(code)) {
      console.log(`  skip (${code})`);
      return;
    }
    throw e;
  }
}

async function main(): Promise<void> {
  const conn = await createConnection({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USERNAME ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE ?? 'sigma_pmo',
  });
  console.log('connected to', process.env.DB_DATABASE);

  console.log('[1] company table');
  await run(conn, `
    CREATE TABLE IF NOT EXISTS \`company\` (
      \`id\` char(36) NOT NULL,
      \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      \`slug\` varchar(120) NOT NULL,
      \`name\` varchar(255) NOT NULL,
      \`companyType\` varchar(32) NOT NULL,
      \`status\` varchar(16) NOT NULL DEFAULT 'trial',
      \`plan\` varchar(32) NOT NULL DEFAULT 'trial',
      \`ownerEmail\` varchar(320) NULL,
      \`logoKey\` varchar(512) NULL,
      \`country\` varchar(2) NULL,
      \`createdById\` char(36) NULL,
      UNIQUE INDEX \`UQ_company_slug\` (\`slug\`),
      INDEX \`IDX_company_companyType\` (\`companyType\`),
      INDEX \`IDX_company_status\` (\`status\`),
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB`);
  await run(conn,
    `INSERT IGNORE INTO \`company\` (\`id\`,\`slug\`,\`name\`,\`companyType\`,\`status\`,\`plan\`)
     VALUES (?, 'sigma-default', 'Sigma (default)', 'pmo', 'active', 'enterprise')`,
    [DEFAULT_COMPANY_ID]);

  console.log('[2] subscription + support_request tables');
  await run(conn, `
    CREATE TABLE IF NOT EXISTS \`subscription\` (
      \`id\` char(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      \`companyId\` char(36) NOT NULL, \`plan\` varchar(32) NOT NULL DEFAULT 'trial',
      \`status\` varchar(16) NOT NULL DEFAULT 'trial', \`seats\` int NOT NULL DEFAULT 1,
      \`startedAt\` date NULL, \`renewsAt\` date NULL, \`mrr\` decimal(12,2) NOT NULL DEFAULT '0.00',
      UNIQUE INDEX \`UQ_subscription_company\` (\`companyId\`), INDEX \`IDX_subscription_status\` (\`status\`),
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB`);
  await run(conn, `
    CREATE TABLE IF NOT EXISTS \`support_request\` (
      \`id\` char(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      \`companyId\` char(36) NOT NULL, \`kind\` varchar(32) NOT NULL DEFAULT 'support',
      \`subject\` varchar(255) NOT NULL, \`body\` text NULL, \`status\` varchar(16) NOT NULL DEFAULT 'open',
      \`createdByEmail\` varchar(320) NULL, \`reply\` text NULL,
      INDEX \`IDX_support_company\` (\`companyId\`), INDEX \`IDX_support_status\` (\`status\`),
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB`);

  console.log('[3] companyId on user');
  await run(conn, `ALTER TABLE \`user\` ADD \`companyId\` char(36) NULL`);
  await run(conn, `CREATE INDEX \`IDX_user_companyId\` ON \`user\` (\`companyId\`)`);
  await run(conn, `UPDATE \`user\` SET \`companyId\` = ? WHERE \`companyId\` IS NULL`, [DEFAULT_COMPANY_ID]);

  console.log('[4] companyId on traceable tables');
  for (const t of TRACEABLE) {
    await run(conn, `ALTER TABLE \`${t}\` ADD \`companyId\` char(36) NULL`);
    await run(conn, `CREATE INDEX \`IDX_${t}_companyId\` ON \`${t}\` (\`companyId\`)`);
    await run(conn, `UPDATE \`${t}\` SET \`companyId\` = ? WHERE \`companyId\` IS NULL`, [DEFAULT_COMPANY_ID]);
  }

  await conn.end();
  console.log('Tenancy schema applied (idempotent).');
}

main().catch((e) => {
  console.error('apply failed:', (e as Error).message);
  process.exit(1);
});
