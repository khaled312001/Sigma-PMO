import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-session API keys (audit 2026-06-28): add `user.apiKeyHashes` (JSON) so a
 * second login to the SAME account (another tab/device, or a shared demo account)
 * no longer rotates away and invalidates the existing session. `apiKeyHash`
 * stays the current key; this column keeps the last few keys valid too. Additive
 * only — nullable, no backfill needed (current keys keep working via apiKeyHash).
 */
export class MultiSessionApiKeys1782900000000 implements MigrationInterface {
  name = 'MultiSessionApiKeys1782900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('user');
    if (table && !table.findColumnByName('apiKeyHashes')) {
      await queryRunner.query('ALTER TABLE `user` ADD `apiKeyHashes` json NULL');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('user');
    if (table && table.findColumnByName('apiKeyHashes')) {
      await queryRunner.query('ALTER TABLE `user` DROP COLUMN `apiKeyHashes`');
    }
  }
}
