/**
 * Set or rotate a password on an existing user. For dev bootstrap and for
 * admins assigning a password to an API-key-only user.
 *
 * Usage:  npm run user:set-password -- <email> <password>
 */
import { randomBytes, scryptSync } from 'node:crypto';

import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { User } from '../src/modules/canonical/entities';

/* eslint-disable no-console */

async function main(): Promise<void> {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: npm run user:set-password -- <email> <password>');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const repo = app.get(DataSource).getRepository(User);
    const user = await repo.findOne({ where: { email: email.toLowerCase() } });
    if (!user) { console.error(`No user with email ${email}.`); process.exitCode = 1; return; }
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64, { N: 16384 }).toString('hex');
    user.passwordHash = hash;
    user.passwordSalt = salt;
    await repo.save(user);
    console.log(`Password updated for ${user.email}. They can sign in interactively now.`);
  } finally {
    await app.close();
  }
}

void main();
