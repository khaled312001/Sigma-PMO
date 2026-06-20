import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Contractual Authority Matrix (Mr. Ayham acceptance #10, 2026-06-20): the
 * authority_matrix_entry register — per project, the authorized representatives
 * and the contractual actions they may take (issue instruction, approve
 * material, approve variation, send notice, approve EOT, certify payment, …),
 * with optional monetary limit and validity window. Append-only by
 * (businessKey, isCurrent). Additive only.
 */
export class AuthorityMatrix1782600000000 implements MigrationInterface {
  name = 'AuthorityMatrix1782600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `authority_matrix_entry` (' +
        '`id` varchar(36) NOT NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`projectBusinessKey` varchar(64) NOT NULL, `businessKey` varchar(64) NOT NULL, ' +
        '`party` varchar(24) NOT NULL, `personName` varchar(255) NOT NULL, `personEmail` varchar(320) NULL, ' +
        '`title` varchar(255) NULL, `actions` json NOT NULL, ' +
        '`monetaryLimit` decimal(18,2) NULL, `currency` varchar(8) NULL, ' +
        '`validFrom` date NULL, `validTo` date NULL, `evidenceSourceFileId` char(36) NULL, ' +
        "`status` varchar(16) NOT NULL DEFAULT 'active', `notes` text NULL, " +
        '`version` int NOT NULL DEFAULT 1, `isCurrent` tinyint NOT NULL DEFAULT 1, `createdBy` varchar(128) NULL, ' +
        'INDEX `IDX_authmx_projectKey` (`projectBusinessKey`), INDEX `IDX_authmx_businessKey` (`businessKey`), ' +
        'INDEX `IDX_authmx_party` (`party`), INDEX `IDX_authmx_email` (`personEmail`), ' +
        'INDEX `IDX_authmx_status` (`status`), INDEX `IDX_authmx_proj_current` (`projectBusinessKey`, `isCurrent`), ' +
        'INDEX `IDX_authmx_isCurrent` (`isCurrent`), PRIMARY KEY (`id`)' +
        ') ENGINE=InnoDB',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `authority_matrix_entry`');
  }
}
