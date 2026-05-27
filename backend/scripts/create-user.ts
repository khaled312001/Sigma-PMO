/**
 * Create a User and print its raw API key once. The key is hashed before
 * persistence — capture it now or rotate later.
 *
 * Usage:  npm run user:create -- <email> <role> [displayName] [projectScopes]
 *   roles: sigma_admin | sigma_reviewer | client | consultant | contractor
 */
import { createHash, randomBytes } from 'node:crypto';

import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { User } from '../src/modules/canonical/entities';
import { Role } from '../src/modules/auth/roles.enum';

/* eslint-disable no-console */

async function main(): Promise<void> {
  const [email, role, displayName, projectScopes] = process.argv.slice(2);
  if (!email || !role) {
    console.error('Usage: npm run user:create -- <email> <role> [displayName] [projectScopes]');
    process.exitCode = 1;
    return;
  }
  if (!Object.values(Role).includes(role as Role)) {
    console.error(`Invalid role "${role}". Valid: ${Object.values(Role).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const repo = app.get(DataSource).getRepository(User);
    const rawKey = `sk_${randomBytes(24).toString('hex')}`;
    const apiKeyHash = createHash('sha256').update(rawKey).digest('hex');

    const user = await repo.save(
      repo.create({
        email,
        displayName: displayName ?? email,
        role: role as Role,
        apiKeyHash,
        projectScopes: projectScopes ?? '*',
        active: true,
      }),
    );

    console.log(`Created user ${user.id} (${user.email}, ${user.role}).`);
    console.log(`API key (store now, not printed again): ${rawKey}`);
  } finally {
    await app.close();
  }
}

void main();
