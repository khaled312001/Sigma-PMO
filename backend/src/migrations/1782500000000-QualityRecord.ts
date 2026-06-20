import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * QA/QC Governance (Mr. Ayham acceptance #4, 2026-06-20): the quality_record
 * register — Inspection Requests (WIR), Material Inspection Requests (MIR),
 * Method Statements, ITPs with hold/witness points, NCRs, corrective actions
 * and test reports — append-only by (businessKey, isCurrent), carrying the NCR
 * claim chain (blocksProgress + affectedActivityKeys + eotDays + costImpact).
 * Additive only.
 */
export class QualityRecord1782500000000 implements MigrationInterface {
  name = 'QualityRecord1782500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `quality_record` (' +
        '`id` varchar(36) NOT NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`projectBusinessKey` varchar(64) NOT NULL, `businessKey` varchar(64) NOT NULL, ' +
        '`title` varchar(255) NOT NULL, `recordType` varchar(32) NOT NULL, ' +
        '`severity` varchar(16) NULL, `status` varchar(16) NOT NULL DEFAULT \'open\', `recordDate` date NULL, ' +
        '`disposition` varchar(16) NULL, `inspectionResult` varchar(16) NULL, ' +
        '`holdPoint` tinyint NOT NULL DEFAULT 0, `witnessPoint` tinyint NOT NULL DEFAULT 0, ' +
        '`blocksProgress` tinyint NOT NULL DEFAULT 0, `affectedActivityKeys` json NULL, ' +
        '`eotDays` int NULL, `costImpact` decimal(18,2) NULL, `reinspectionOf` varchar(64) NULL, ' +
        '`linkedClaimId` char(36) NULL, `details` json NULL, ' +
        '`version` int NOT NULL DEFAULT 1, `isCurrent` tinyint NOT NULL DEFAULT 1, `createdBy` varchar(128) NULL, ' +
        'INDEX `IDX_quality_projectKey` (`projectBusinessKey`), INDEX `IDX_quality_businessKey` (`businessKey`), ' +
        'INDEX `IDX_quality_recordType` (`recordType`), INDEX `IDX_quality_status` (`status`), ' +
        'INDEX `IDX_quality_proj_current` (`projectBusinessKey`, `isCurrent`), INDEX `IDX_quality_isCurrent` (`isCurrent`), ' +
        'PRIMARY KEY (`id`)' +
        ') ENGINE=InnoDB',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `quality_record`');
  }
}
