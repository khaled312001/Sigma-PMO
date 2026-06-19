import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Communication governance (Mr. Ayham, 2026-06-19): the `communication` table —
 * an auditable record of project communications/notices with an authenticated
 * open-in-Sigma evidence trail. Additive only.
 */
export class Communications1782200000000 implements MigrationInterface {
  name = 'Communications1782200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `communication` (' +
        '`id` varchar(36) NOT NULL, ' +
        '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`companyId` char(36) NULL, ' +
        '`projectBusinessKey` varchar(64) NULL, ' +
        '`commId` varchar(32) NOT NULL, ' +
        "`category` varchar(32) NOT NULL DEFAULT 'general', " +
        '`subject` varchar(512) NOT NULL, ' +
        '`body` text NULL, ' +
        '`attachments` json NULL, ' +
        '`senderEmail` varchar(320) NULL, `senderRole` varchar(32) NULL, ' +
        '`recipientEmail` varchar(320) NULL, `recipientCompany` varchar(255) NULL, `recipientRole` varchar(32) NULL, ' +
        "`status` varchar(24) NOT NULL DEFAULT 'sent', " +
        '`requiresAck` tinyint NOT NULL DEFAULT 0, ' +
        '`actionDueDate` date NULL, ' +
        '`sentAt` datetime(6) NULL, `deliveredAt` datetime(6) NULL, ' +
        '`openedAt` datetime(6) NULL, `openedByEmail` varchar(320) NULL, ' +
        '`attachmentViewedAt` datetime(6) NULL, `acknowledgedAt` datetime(6) NULL, `respondedAt` datetime(6) NULL, ' +
        '`responseDecision` varchar(16) NULL, `reply` text NULL, ' +
        '`escalatedAt` datetime(6) NULL, `escalationLevel` int NULL, ' +
        '`createdByEmail` varchar(320) NULL, ' +
        'INDEX `IDX_communication_companyId` (`companyId`), ' +
        'INDEX `IDX_communication_projectKey` (`projectBusinessKey`), ' +
        'INDEX `IDX_communication_commId` (`commId`), ' +
        'INDEX `IDX_communication_category` (`category`), ' +
        'INDEX `IDX_communication_status` (`status`), ' +
        'PRIMARY KEY (`id`)' +
        ') ENGINE=InnoDB',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `communication`');
  }
}
