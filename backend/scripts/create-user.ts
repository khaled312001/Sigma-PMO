/**
 * Create a user with an interactive password and (optional) Emirates ID.
 *
 * Usage:
 *   npm run user:create -- <email> <role> <password> [displayName] [emiratesId] [scopes]
 *
 * Roles: sigma_admin | sigma_reviewer | client | consultant | contractor
 *
 * The password is scrypt-hashed before persistence (per-user salt). A fresh
 * API key is also generated so the user can hit the API directly without a
 * browser session; both auth paths work side by side.
 *
 * Emirates ID is optional; format is normalised to XXX-XXXX-XXXXXXX-X.
 */
import { createHash, randomBytes, scryptSync } from 'node:crypto';

import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { User } from '../src/modules/canonical/entities';
import { Role } from '../src/modules/auth/roles.enum';

/* eslint-disable no-console */

function normaliseEmiratesId(input: string | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length !== 15) {
    throw new Error(`Emirates ID must be 15 digits (got ${digits.length}).`);
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 14)}-${digits.slice(14)}`;
}

async function main(): Promise<void> {
  const [email, role, password, displayName, emiratesIdRaw, projectScopes] = process.argv.slice(2);
  if (!email || !role || !password) {
    console.error('Usage: npm run user:create -- <email> <role> <password> [displayName] [emiratesId] [scopes]');
    process.exitCode = 1;
    return;
  }
  if (!Object.values(Role).includes(role as Role)) {
    console.error(`Invalid role "${role}". Valid: ${Object.values(Role).join(', ')}`);
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exitCode = 1;
    return;
  }
  let emiratesId: string | null;
  try { emiratesId = normaliseEmiratesId(emiratesIdRaw); }
  catch (e) { console.error((e as Error).message); process.exitCode = 1; return; }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const repo = app.get(DataSource).getRepository(User);
    const rawKey = `sk_${randomBytes(24).toString('hex')}`;
    const apiKeyHash = createHash('sha256').update(rawKey).digest('hex');

    const salt = randomBytes(16).toString('hex');
    const passwordHash = scryptSync(password, salt, 64, { N: 16384 }).toString('hex');

    const user = await repo.save(
      repo.create({
        email: email.toLowerCase(),
        displayName: displayName ?? email,
        role: role as Role,
        apiKeyHash,
        passwordHash,
        passwordSalt: salt,
        emiratesId,
        projectScopes: projectScopes ?? '*',
        active: true,
      }),
    );

    console.log(`Created user ${user.id} (${user.email}, ${user.role}).`);
    console.log(`Password set (scrypt-hashed). User can sign in with email + password from the /auth page.`);
    if (emiratesId) console.log(`Emirates ID: ${emiratesId}`);
    console.log(`Bootstrap API key (also valid for x-api-key header, rotates on next interactive login):`);
    console.log(`  ${rawKey}`);
  } finally {
    await app.close();
  }
}

void main();
