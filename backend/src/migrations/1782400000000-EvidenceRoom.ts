import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Scalable Evidence Memory / Dispute Data Room (Mr. Ayham, 2026-06-19):
 * evidence_room (data room + raisable limits + assembled report), evidence_file
 * (the Evidence Index), evidence_chunk (source-preserving slices), evidence_item
 * (source-linked findings). Additive only.
 */
export class EvidenceRoom1782400000000 implements MigrationInterface {
  name = 'EvidenceRoom1782400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `evidence_room` (' +
        '`id` varchar(36) NOT NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`companyId` char(36) NULL, `projectBusinessKey` varchar(64) NULL, ' +
        "`kind` varchar(24) NOT NULL DEFAULT 'standard', `mode` varchar(24) NOT NULL DEFAULT 'standard', " +
        '`title` varchar(512) NOT NULL, `description` text NULL, ' +
        "`status` varchar(24) NOT NULL DEFAULT 'open', `stage` varchar(32) NULL, " +
        '`limits` json NOT NULL, `limitOverride` tinyint NOT NULL DEFAULT 0, ' +
        '`counts` json NULL, `report` json NULL, `lastProcessedAt` datetime(6) NULL, ' +
        '`createdByEmail` varchar(320) NULL, ' +
        'INDEX `IDX_evroom_companyId` (`companyId`), INDEX `IDX_evroom_projectKey` (`projectBusinessKey`), ' +
        'INDEX `IDX_evroom_status` (`status`), PRIMARY KEY (`id`)' +
        ') ENGINE=InnoDB',
    );
    await queryRunner.query(
      'CREATE TABLE `evidence_file` (' +
        '`id` varchar(36) NOT NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`roomId` char(36) NOT NULL, `companyId` char(36) NULL, ' +
        '`fileName` varchar(512) NOT NULL, `ext` varchar(16) NULL, `mimeType` varchar(128) NULL, ' +
        '`bytes` bigint NOT NULL DEFAULT 0, `sha256` char(64) NULL, `storedPath` varchar(512) NULL, ' +
        "`category` varchar(24) NOT NULL DEFAULT 'other', `docNumber` varchar(128) NULL, `party` varchar(255) NULL, " +
        '`docDate` date NULL, `pageCount` int NULL, `chunkCount` int NOT NULL DEFAULT 0, ' +
        "`status` varchar(24) NOT NULL DEFAULT 'received', `error` text NULL, `createdByEmail` varchar(320) NULL, " +
        'INDEX `IDX_evfile_roomId` (`roomId`), INDEX `IDX_evfile_companyId` (`companyId`), ' +
        'INDEX `IDX_evfile_sha` (`sha256`), INDEX `IDX_evfile_category` (`category`), INDEX `IDX_evfile_status` (`status`), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await queryRunner.query(
      'CREATE TABLE `evidence_chunk` (' +
        '`id` varchar(36) NOT NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`roomId` char(36) NOT NULL, `fileId` char(36) NOT NULL, `companyId` char(36) NULL, ' +
        '`chunkIndex` int NOT NULL, `page` int NULL, `paragraph` int NULL, `text` mediumtext NOT NULL, `charCount` int NOT NULL DEFAULT 0, ' +
        'INDEX `IDX_evchunk_roomId` (`roomId`), INDEX `IDX_evchunk_fileId` (`fileId`), PRIMARY KEY (`id`)' +
        ') ENGINE=InnoDB',
    );
    await queryRunner.query(
      'CREATE TABLE `evidence_item` (' +
        '`id` varchar(36) NOT NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`roomId` char(36) NOT NULL, `companyId` char(36) NULL, `type` varchar(24) NOT NULL, `layer` varchar(32) NULL, ' +
        '`label` varchar(512) NOT NULL, `value` text NULL, `explanation` text NULL, `effectiveDate` date NULL, ' +
        '`chronologyOrder` int NULL, `confidence` float NOT NULL DEFAULT 0, `sourceRefs` json NULL, `relatedItemIds` json NULL, ' +
        "`status` varchar(24) NOT NULL DEFAULT 'proposed', `correctedValue` text NULL, `decidedByEmail` varchar(320) NULL, " +
        'INDEX `IDX_evitem_roomId` (`roomId`), INDEX `IDX_evitem_companyId` (`companyId`), ' +
        'INDEX `IDX_evitem_type` (`type`), INDEX `IDX_evitem_status` (`status`), PRIMARY KEY (`id`)' +
        ') ENGINE=InnoDB',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `evidence_item`');
    await queryRunner.query('DROP TABLE `evidence_chunk`');
    await queryRunner.query('DROP TABLE `evidence_file`');
    await queryRunner.query('DROP TABLE `evidence_room`');
  }
}
