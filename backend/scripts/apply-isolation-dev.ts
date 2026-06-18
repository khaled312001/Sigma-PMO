/**
 * Apply the tenant-isolation columns added after the initial Tenancy migration
 * to the DEV database (DB_SYNCHRONIZE=false). Idempotent. Currently:
 *  - ingestion_run.companyId (scopes the audit trail + overview per company).
 *   npx ts-node scripts/apply-isolation-dev.ts
 */
import 'dotenv/config';
import { createConnection, Connection } from 'mysql2/promise';

const IGNORABLE = new Set(['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME']);

async function run(conn: Connection, sql: string): Promise<void> {
  try {
    await conn.query(sql);
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    if (IGNORABLE.has(code)) { console.log(`  skip (${code})`); return; }
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

  console.log('[1] companyId on ingestion_run');
  await run(conn, `ALTER TABLE \`ingestion_run\` ADD \`companyId\` char(36) NULL`);
  await run(conn, `CREATE INDEX \`IDX_ingestion_run_companyId\` ON \`ingestion_run\` (\`companyId\`)`);

  console.log('[2] companyId on investment entities');
  for (const t of ['investment_opportunity', 'opportunity_screening', 'feasibility_assessment']) {
    await run(conn, `ALTER TABLE \`${t}\` ADD \`companyId\` char(36) NULL`);
    await run(conn, `CREATE INDEX \`IDX_${t}_companyId\` ON \`${t}\` (\`companyId\`)`);
  }

  await conn.end();
  console.log('Isolation schema applied (idempotent).');
}

main().catch((e) => {
  console.error('apply failed:', (e as Error).message);
  process.exit(1);
});
