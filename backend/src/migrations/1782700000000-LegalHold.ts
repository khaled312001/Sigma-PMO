import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Legal-grade Evidence Integrity (Mr. Ayham acceptance #6/#12, 2026-06-20):
 * legal_hold (preservation holds that block hard-deletion of dispute-linked
 * rows) + custody_event (the append-only document chain-of-custody ledger with
 * the file SHA-256 at each event). Additive only.
 */
export class LegalHold1782700000000 implements MigrationInterface {
  name = 'LegalHold1782700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `legal_hold` (' +
        '`id` varchar(36) NOT NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`companyId` char(36) NULL, `projectBusinessKey` varchar(64) NULL, ' +
        '`targetTable` varchar(64) NOT NULL, `targetId` char(36) NOT NULL, `targetLabel` varchar(512) NULL, ' +
        '`reason` text NOT NULL, `matterRef` varchar(128) NULL, ' +
        "`status` varchar(16) NOT NULL DEFAULT 'active', `placedByEmail` varchar(320) NULL, " +
        '`releasedByEmail` varchar(320) NULL, `releasedAt` datetime(6) NULL, `releaseReason` text NULL, ' +
        'INDEX `IDX_hold_companyId` (`companyId`), INDEX `IDX_hold_projectKey` (`projectBusinessKey`), ' +
        'INDEX `IDX_hold_target` (`targetId`), INDEX `IDX_hold_status` (`status`), ' +
        'INDEX `IDX_hold_target_status` (`targetTable`, `targetId`, `status`), PRIMARY KEY (`id`)' +
        ') ENGINE=InnoDB',
    );
    await queryRunner.query(
      'CREATE TABLE `custody_event` (' +
        '`id` varchar(36) NOT NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`companyId` char(36) NULL, `projectBusinessKey` varchar(64) NULL, ' +
        '`targetTable` varchar(64) NOT NULL, `targetId` char(36) NOT NULL, `event` varchar(24) NOT NULL, ' +
        '`actorEmail` varchar(320) NULL, `actorRole` varchar(32) NULL, `ip` varchar(64) NULL, ' +
        '`shaAtEvent` char(64) NULL, `detail` json NULL, ' +
        'INDEX `IDX_custody_companyId` (`companyId`), INDEX `IDX_custody_projectKey` (`projectBusinessKey`), ' +
        'INDEX `IDX_custody_target` (`targetId`), INDEX `IDX_custody_event` (`event`), ' +
        'INDEX `IDX_custody_target_pair` (`targetTable`, `targetId`), PRIMARY KEY (`id`)' +
        ') ENGINE=InnoDB',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `custody_event`');
    await queryRunner.query('DROP TABLE `legal_hold`');
  }
}
