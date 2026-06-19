import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Security hardening (Mr. Ayham, 2026-06-19):
 *  - `user.isDemo`        — flags seeded sample accounts so they can be refused
 *                            authentication on UAT/production (DEMO_LOGIN_PUBLIC=false).
 *  - `source_file.companyId` — tenant-stamps the file archive (defence-in-depth).
 *  - `audit_log`          — always-on append-only audit trail (who/what/when/outcome).
 *
 * Additive only; safe to run on the live database (migrationsRun on boot).
 */
export class SecurityHardening1782000000000 implements MigrationInterface {
  name = 'SecurityHardening1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `user` ADD `isDemo` tinyint NOT NULL DEFAULT 0",
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_user_isDemo` ON `user` (`isDemo`)',
    );
    await queryRunner.query(
      'ALTER TABLE `source_file` ADD `companyId` char(36) NULL',
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_source_file_companyId` ON `source_file` (`companyId`)',
    );
    await queryRunner.query(
      'CREATE TABLE `audit_log` (' +
        '`id` varchar(36) NOT NULL, ' +
        '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`companyId` char(36) NULL, ' +
        '`actorUserId` char(36) NULL, ' +
        '`actorEmail` varchar(320) NULL, ' +
        '`actorRole` varchar(32) NULL, ' +
        '`action` varchar(64) NOT NULL, ' +
        '`method` varchar(8) NULL, ' +
        '`path` varchar(512) NULL, ' +
        '`statusCode` int NULL, ' +
        '`ip` varchar(64) NULL, ' +
        '`meta` json NULL, ' +
        'INDEX `IDX_audit_log_companyId` (`companyId`), ' +
        'INDEX `IDX_audit_log_action` (`action`), ' +
        'INDEX `IDX_audit_log_company_created` (`companyId`, `createdAt`), ' +
        'PRIMARY KEY (`id`)' +
        ') ENGINE=InnoDB',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `audit_log`');
    await queryRunner.query('DROP INDEX `IDX_source_file_companyId` ON `source_file`');
    await queryRunner.query('ALTER TABLE `source_file` DROP COLUMN `companyId`');
    await queryRunner.query('DROP INDEX `IDX_user_isDemo` ON `user`');
    await queryRunner.query('ALTER TABLE `user` DROP COLUMN `isDemo`');
  }
}
