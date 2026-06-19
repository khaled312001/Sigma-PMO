import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Universal Input (Mr. Ayham, 2026-06-19): the `input_proposal` staging table
 * that holds AI-extracted, layer-mapped items for human review before commit.
 * Additive only.
 */
export class UniversalInput1782100000000 implements MigrationInterface {
  name = 'UniversalInput1782100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `input_proposal` (' +
        '`id` varchar(36) NOT NULL, ' +
        '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`companyId` char(36) NULL, ' +
        '`projectBusinessKey` varchar(64) NULL, ' +
        "`status` varchar(24) NOT NULL DEFAULT 'pending_review', " +
        '`source` json NOT NULL, ' +
        '`summary` text NULL, ' +
        '`model` varchar(64) NULL, ' +
        '`items` json NOT NULL, ' +
        '`questions` json NULL, ' +
        '`createdByEmail` varchar(320) NULL, ' +
        '`committedAt` datetime(6) NULL, ' +
        '`committedByEmail` varchar(320) NULL, ' +
        '`commitResult` json NULL, ' +
        'INDEX `IDX_input_proposal_companyId` (`companyId`), ' +
        'INDEX `IDX_input_proposal_projectKey` (`projectBusinessKey`), ' +
        'INDEX `IDX_input_proposal_status` (`status`), ' +
        'PRIMARY KEY (`id`)' +
        ') ENGINE=InnoDB',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `input_proposal`');
  }
}
