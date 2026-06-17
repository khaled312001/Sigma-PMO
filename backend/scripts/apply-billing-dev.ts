/**
 * Apply the Stripe-billing columns to the DEV database directly (dev runs with
 * DB_SYNCHRONIZE=false, so `migration:run` can't be used here). Idempotent —
 * skips already-applied columns/indexes. Adds the Stripe linkage + trial fields
 * to the `subscription` table.
 *   npx ts-node scripts/apply-billing-dev.ts
 */
import 'dotenv/config';
import { createConnection, Connection } from 'mysql2/promise';

const IGNORABLE = new Set([
  'ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_CANT_DROP_FIELD_OR_KEY',
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

  console.log('[1] Stripe columns on subscription');
  await run(conn, `ALTER TABLE \`subscription\` ADD \`stripeCustomerId\` varchar(64) NULL`);
  await run(conn, `ALTER TABLE \`subscription\` ADD \`stripeSubscriptionId\` varchar(64) NULL`);
  await run(conn, `ALTER TABLE \`subscription\` ADD \`trialEndsAt\` datetime NULL`);
  await run(conn, `ALTER TABLE \`subscription\` ADD \`currentPeriodEnd\` datetime NULL`);
  await run(conn, `CREATE INDEX \`IDX_subscription_stripeSub\` ON \`subscription\` (\`stripeSubscriptionId\`)`);

  await conn.end();
  console.log('Billing schema applied (idempotent).');
}

main().catch((e) => {
  console.error('apply failed:', (e as Error).message);
  process.exit(1);
});
