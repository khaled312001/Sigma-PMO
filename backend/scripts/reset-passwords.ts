/**
 * One-shot: reset passwords for all dev users to known values.
 *
 * Run from the backend directory:
 *   npx ts-node scripts/reset-passwords.ts
 *
 * Uses the same scrypt parameters as `create-user.ts` (N=16384, 64-byte
 * derived key, 16-byte hex salt) so logins succeed via `auth.controller.ts`.
 *
 * SAFE TO COMMIT: contains no secret values — the passwords printed here
 * are intentionally weak dev-mode credentials and the script only mutates
 * a local database. NEVER run against production.
 */
import { randomBytes, scryptSync } from 'node:crypto';
import * as mysql from 'mysql2/promise';

interface Target {
  email: string;
  password: string;
  role: string; // for printing only
}

const TARGETS: Target[] = [
  { email: 'admin@sigma.local',      password: 'AdminSigma#2026',      role: 'sigma_admin' },
  { email: 'khaled@sigma.local',     password: 'KhaledSigma#2026',     role: 'sigma_admin (dev)' },
  { email: 'reviewer@sigma.local',   password: 'ReviewerSigma#2026',   role: 'sigma_reviewer' },
  { email: 'client@sigma.ae',        password: 'ClientSigma#2026',     role: 'client (Al Ayham)' },
  { email: 'consultant@sigma.ae',    password: 'ConsultantSigma#2026', role: 'consultant' },
  { email: 'contractor@sigma.ae',    password: 'ContractorSigma#2026', role: 'contractor' },
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
  console.log('Resetting passwords for dev users…\n');
  for (const t of TARGETS) {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(t.password, salt, 64, { N: 16384 }).toString('hex');
    const [result] = await conn.execute<mysql.ResultSetHeader>(
      'UPDATE user SET passwordHash = ?, passwordSalt = ? WHERE email = ?',
      [hash, salt, t.email],
    );
    if (result.affectedRows === 0) {
      console.log(`  MISSING  ${t.email.padEnd(28)}  (no row — run create-user.ts first)`);
    } else {
      console.log(`  OK       ${t.email.padEnd(28)}  password=${t.password}`);
    }
  }
  await conn.end();
  console.log('\nDone. Sign in at http://localhost:3000/auth using any of the email+password pairs above.');
}

void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
