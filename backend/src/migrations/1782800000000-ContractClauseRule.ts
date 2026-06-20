import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Contract Rules Engine (Mr. Ayham acceptance #2, 2026-06-20): the
 * contract_clause_rule register — notice / time-bar / response-period /
 * deemed-approval / particulars / determination / instruction-authority rules
 * (seedable from a FIDIC preset), append-only by (businessKey, isCurrent).
 * Additive only.
 */
export class ContractClauseRule1782800000000 implements MigrationInterface {
  name = 'ContractClauseRule1782800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `contract_clause_rule` (' +
        '`id` varchar(36) NOT NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`projectBusinessKey` varchar(64) NOT NULL, `businessKey` varchar(64) NOT NULL, ' +
        '`contractStandard` varchar(64) NOT NULL, `clauseRef` varchar(32) NULL, `title` varchar(255) NOT NULL, ' +
        '`ruleType` varchar(32) NOT NULL, `triggerEvent` text NULL, `daysToAct` int NULL, `actor` varchar(24) NULL, ' +
        '`consequence` text NULL, `deemedOutcome` varchar(16) NULL, `basis` text NULL, ' +
        "`status` varchar(16) NOT NULL DEFAULT 'active', " +
        '`version` int NOT NULL DEFAULT 1, `isCurrent` tinyint NOT NULL DEFAULT 1, `createdBy` varchar(128) NULL, ' +
        'INDEX `IDX_ccr_projectKey` (`projectBusinessKey`), INDEX `IDX_ccr_businessKey` (`businessKey`), ' +
        'INDEX `IDX_ccr_ruleType` (`ruleType`), INDEX `IDX_ccr_status` (`status`), ' +
        'INDEX `IDX_ccr_proj_current` (`projectBusinessKey`, `isCurrent`), INDEX `IDX_ccr_isCurrent` (`isCurrent`), ' +
        'PRIMARY KEY (`id`)' +
        ') ENGINE=InnoDB',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `contract_clause_rule`');
  }
}
