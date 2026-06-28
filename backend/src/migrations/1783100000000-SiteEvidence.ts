import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Smart-glasses / site-evidence capture channel (Mr. Ayham acceptance
 * 2026-06-28): the `site_evidence` register — photo / video / audio / transcript
 * captured on site with rich metadata (when/where/who/device/activity), the
 * archived media (sha256 + storedPath), the daily-rollup `reportDate`, and the
 * optional safety/quality finding link. Additive only.
 */
export class SiteEvidence1783100000000 implements MigrationInterface {
  name = 'SiteEvidence1783100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.getTable('site_evidence');
    if (exists) return;
    await queryRunner.query(
      'CREATE TABLE `site_evidence` (' +
        '`id` varchar(36) NOT NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`companyId` char(36) NULL, `projectBusinessKey` varchar(64) NOT NULL, ' +
        '`mediaKind` varchar(16) NOT NULL, `filename` varchar(255) NOT NULL, ' +
        '`mimeType` varchar(128) NOT NULL, `bytes` int NOT NULL, `sha256` char(64) NOT NULL, ' +
        '`storedPath` varchar(512) NOT NULL, `capturedAt` datetime(6) NULL, `reportDate` date NULL, ' +
        '`latitude` decimal(10,7) NULL, `longitude` decimal(10,7) NULL, `locationLabel` varchar(255) NULL, ' +
        '`activityKey` varchar(64) NULL, `workerName` varchar(128) NULL, `workerId` varchar(64) NULL, ' +
        '`deviceId` varchar(64) NULL, `deviceType` varchar(16) NULL, `transcriptText` text NULL, ' +
        '`findingType` varchar(16) NULL, `linkedSafetyRecordId` char(36) NULL, `linkedQualityRecordId` char(36) NULL, ' +
        '`capturedBy` varchar(128) NULL, ' +
        'INDEX `IDX_site_evidence_companyId` (`companyId`), ' +
        'INDEX `IDX_site_evidence_projectKey` (`projectBusinessKey`), ' +
        'INDEX `IDX_site_evidence_mediaKind` (`mediaKind`), ' +
        'INDEX `IDX_site_evidence_reportDate` (`reportDate`), ' +
        'INDEX `IDX_site_evidence_activityKey` (`activityKey`), ' +
        'INDEX `IDX_site_evidence_proj_date` (`projectBusinessKey`, `reportDate`), ' +
        'PRIMARY KEY (`id`)' +
        ') ENGINE=InnoDB',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `site_evidence`');
  }
}
