/**
 * One-shot: seed demo accounts for the expanded role taxonomy
 * (owner, operator, investor, lender, pmo, governance_board — 2026-06-12).
 *
 * Run from the backend directory:
 *   npx ts-node scripts/seed-expanded-roles.ts
 *
 * Idempotent: inserts the user when absent, otherwise refreshes its password.
 * Uses the same scrypt params as reset-passwords.ts (N=16384, 64-byte key,
 * 16-byte hex salt) so logins succeed via auth.controller.ts. Dev-only weak
 * credentials; never run against production.
 */
import { randomBytes, scryptSync, createHash, randomUUID } from 'node:crypto';
import * as mysql from 'mysql2/promise';

interface Target {
  email: string;
  password: string;
  role: string;
  displayName: string;
}

const TARGETS: Target[] = [
  { email: 'owner@sigma.ae',      password: 'OwnerSigma#2026',      role: 'owner',            displayName: 'Asset Owner' },
  { email: 'operator@sigma.ae',   password: 'OperatorSigma#2026',   role: 'operator',         displayName: 'Facility Operator' },
  { email: 'investor@sigma.ae',   password: 'InvestorSigma#2026',   role: 'investor',         displayName: 'Equity Investor' },
  { email: 'lender@sigma.ae',     password: 'LenderSigma#2026',     role: 'lender',           displayName: 'Financing Bank' },
  { email: 'pmo@sigma.ae',        password: 'PmoSigma#2026',        role: 'pmo',              displayName: 'PMO Office' },
  { email: 'board@sigma.ae',      password: 'BoardSigma#2026',      role: 'governance_board', displayName: 'Governance Board' },
];

async function main(): Promise<void> {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USERNAME ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE ?? 'sigma_pmo',
  });

  /* eslint-disable no-console */
  console.log('Seeding expanded-role demo accounts…\n');
  for (const t of TARGETS) {
    const salt = randomBytes(16).toString('hex');
    const passwordHash = scryptSync(t.password, salt, 64, { N: 16384 }).toString('hex');
    const apiKeyHash = createHash('sha256').update(`sk_${randomBytes(24).toString('hex')}`).digest('hex');

    const [existing] = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT id FROM user WHERE email = ?',
      [t.email],
    );
    if (existing.length > 0) {
      await conn.execute(
        'UPDATE user SET passwordHash = ?, passwordSalt = ?, role = ?, active = 1 WHERE email = ?',
        [passwordHash, salt, t.role, t.email],
      );
      console.log(`  UPDATED  ${t.email.padEnd(22)} ${t.role.padEnd(18)} password=${t.password}`);
    } else {
      await conn.execute(
        `INSERT INTO user (id, email, displayName, role, apiKeyHash, passwordHash, passwordSalt, projectScopes, active, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, '*', 1, NOW(6))`,
        [randomUUID(), t.email, t.displayName, t.role, apiKeyHash, passwordHash, salt],
      );
      console.log(`  CREATED  ${t.email.padEnd(22)} ${t.role.padEnd(18)} password=${t.password}`);
    }
  }
  await conn.end();
  console.log('\nDone. Sign in at http://localhost:3000/auth using any pair above.');
}

void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
