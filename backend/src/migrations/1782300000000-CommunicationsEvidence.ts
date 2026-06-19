import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Communication evidence tracking v2 (Mr. Ayham, 2026-06-19). Extends the
 * `communication` table with the full lifecycle/criticality/dispute/deemed-notice
 * evidence columns and adds the per-company, versioned `communication_rule`
 * policy table (channels, approved recipients/roles, unread-alert period,
 * escalation matrix, required ack/response, response SLA, deemed-notice).
 * Additive only.
 */
export class CommunicationsEvidence1782300000000 implements MigrationInterface {
  name = 'CommunicationsEvidence1782300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `communication` ' +
        "ADD COLUMN `criticality` varchar(16) NOT NULL DEFAULT 'normal', " +
        'ADD COLUMN `channel` varchar(64) NULL, ' +
        'ADD COLUMN `requiresResponse` tinyint NOT NULL DEFAULT 0, ' +
        'ADD COLUMN `responseDueAt` datetime(6) NULL, ' +
        'ADD COLUMN `responsibleRole` varchar(32) NULL, ' +
        'ADD COLUMN `attachmentViewedByEmail` varchar(320) NULL, ' +
        'ADD COLUMN `acknowledgedByEmail` varchar(320) NULL, ' +
        'ADD COLUMN `actionCompletedAt` datetime(6) NULL, ' +
        'ADD COLUMN `noActionAt` datetime(6) NULL, ' +
        'ADD COLUMN `deemedServedAt` datetime(6) NULL, ' +
        'ADD COLUMN `firstAlertAt` datetime(6) NULL, ' +
        'ADD COLUMN `disputedAt` datetime(6) NULL, ' +
        'ADD COLUMN `disputedByEmail` varchar(320) NULL, ' +
        'ADD COLUMN `disputeReason` text NULL, ' +
        'ADD COLUMN `escalatedToRole` varchar(32) NULL, ' +
        'ADD COLUMN `escalatedToEmail` varchar(320) NULL, ' +
        'ADD COLUMN `lastEscalationAt` datetime(6) NULL, ' +
        'ADD COLUMN `linkedClaimKey` varchar(64) NULL, ' +
        'ADD COLUMN `linkedRecordKey` varchar(64) NULL',
    );

    await queryRunner.query(
      'CREATE TABLE `communication_rule` (' +
        '`id` varchar(36) NOT NULL, ' +
        '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`companyId` char(36) NULL, ' +
        '`version` int NOT NULL DEFAULT 1, ' +
        '`isCurrent` tinyint NOT NULL DEFAULT 1, ' +
        '`authoredBy` varchar(320) NULL, ' +
        '`config` json NOT NULL, ' +
        'INDEX `IDX_comm_rule_companyId` (`companyId`), ' +
        'INDEX `IDX_comm_rule_isCurrent` (`isCurrent`), ' +
        'PRIMARY KEY (`id`)' +
        ') ENGINE=InnoDB',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `communication_rule`');
    await queryRunner.query(
      'ALTER TABLE `communication` ' +
        'DROP COLUMN `criticality`, DROP COLUMN `channel`, DROP COLUMN `requiresResponse`, ' +
        'DROP COLUMN `responseDueAt`, DROP COLUMN `responsibleRole`, DROP COLUMN `attachmentViewedByEmail`, ' +
        'DROP COLUMN `acknowledgedByEmail`, DROP COLUMN `actionCompletedAt`, DROP COLUMN `noActionAt`, ' +
        'DROP COLUMN `deemedServedAt`, DROP COLUMN `firstAlertAt`, DROP COLUMN `disputedAt`, ' +
        'DROP COLUMN `disputedByEmail`, DROP COLUMN `disputeReason`, DROP COLUMN `escalatedToRole`, ' +
        'DROP COLUMN `escalatedToEmail`, DROP COLUMN `lastEscalationAt`, DROP COLUMN `linkedClaimKey`, ' +
        'DROP COLUMN `linkedRecordKey`',
    );
  }
}
