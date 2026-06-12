import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quantity Survey Intelligence + Procurement Intelligence + the Global Cost
 * Classification Framework (Mr. Ayham, 2026-06-12).
 *
 * Additive only — 5 new tables, zero changes to existing ones:
 *  - cost_estimate        (classified, versioned QS cost estimates)
 *  - qs_finding           (QS cross-source governance findings)
 *  - vendor               (procurement vendor registry + intelligence scores)
 *  - procurement_package  (procurement packages + BIM/procured/installed qty)
 *  - procurement_finding  (procurement governance-validation findings)
 */
export class QuantitySurveyProcurement1783000000000 implements MigrationInterface {
  name = 'QuantitySurveyProcurement1783000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`cost_estimate\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`projectBusinessKey\` varchar(64) NOT NULL,
        \`stage\` varchar(24) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`standard\` varchar(16) NOT NULL DEFAULT 'NRM',
        \`method\` varchar(24) NOT NULL,
        \`currency\` varchar(8) NOT NULL DEFAULT 'AED',
        \`areaSqm\` decimal(18,2) NULL,
        \`totalAmount\` decimal(18,2) NOT NULL,
        \`ratePerSqm\` decimal(18,2) NULL,
        \`elements\` json NOT NULL,
        \`benchmark\` json NULL,
        \`confidence\` double NOT NULL DEFAULT 0.7,
        \`version\` int NOT NULL DEFAULT 1,
        \`isCurrent\` tinyint NOT NULL DEFAULT 1,
        \`createdBy\` varchar(128) NULL,
        INDEX \`IDX_costest_project\` (\`projectBusinessKey\`),
        INDEX \`IDX_costest_stage\` (\`stage\`),
        INDEX \`IDX_costest_current\` (\`isCurrent\`),
        INDEX \`IDX_costest_proj_stage_current\` (\`projectBusinessKey\`, \`stage\`, \`isCurrent\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`qs_finding\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`projectBusinessKey\` varchar(64) NOT NULL,
        \`findingType\` varchar(32) NOT NULL,
        \`severity\` varchar(16) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`description\` text NOT NULL,
        \`refs\` json NOT NULL,
        \`quantum\` decimal(18,2) NULL,
        \`status\` varchar(16) NOT NULL DEFAULT 'open',
        \`dedupKey\` varchar(160) NOT NULL,
        INDEX \`IDX_qsfind_project\` (\`projectBusinessKey\`),
        INDEX \`IDX_qsfind_type\` (\`findingType\`),
        INDEX \`IDX_qsfind_status\` (\`status\`),
        INDEX \`IDX_qsfind_dedup\` (\`dedupKey\`),
        INDEX \`IDX_qsfind_proj_status\` (\`projectBusinessKey\`, \`status\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`vendor\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`businessKey\` varchar(64) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`category\` varchar(64) NOT NULL,
        \`country\` varchar(64) NULL,
        \`qualificationScore\` double NOT NULL DEFAULT 0,
        \`evaluationScore\` double NOT NULL DEFAULT 0,
        \`performanceScore\` double NOT NULL DEFAULT 0,
        \`riskScore\` double NOT NULL DEFAULT 0,
        \`status\` varchar(16) NOT NULL DEFAULT 'provisional',
        \`details\` json NOT NULL,
        \`version\` int NOT NULL DEFAULT 1,
        \`isCurrent\` tinyint NOT NULL DEFAULT 1,
        \`createdBy\` varchar(128) NULL,
        INDEX \`IDX_vendor_bizkey\` (\`businessKey\`),
        INDEX \`IDX_vendor_category\` (\`category\`),
        INDEX \`IDX_vendor_status\` (\`status\`),
        INDEX \`IDX_vendor_current\` (\`isCurrent\`),
        INDEX \`IDX_vendor_bizkey_current\` (\`businessKey\`, \`isCurrent\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`procurement_package\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`projectBusinessKey\` varchar(64) NOT NULL,
        \`businessKey\` varchar(64) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`category\` varchar(64) NOT NULL,
        \`element\` varchar(48) NULL,
        \`unit\` varchar(16) NULL,
        \`status\` varchar(16) NOT NULL DEFAULT 'planned',
        \`strategy\` varchar(24) NULL,
        \`longLead\` tinyint NOT NULL DEFAULT 0,
        \`leadTimeDays\` int NULL,
        \`requiredOnSiteDate\` date NULL,
        \`plannedDeliveryDate\` date NULL,
        \`actualDeliveryDate\` date NULL,
        \`bimQuantity\` decimal(18,4) NULL,
        \`procuredQuantity\` decimal(18,4) NULL,
        \`installedQuantity\` decimal(18,4) NULL,
        \`awardedVendorBusinessKey\` varchar(64) NULL,
        \`estimatedCost\` decimal(18,2) NULL,
        \`awardedCost\` decimal(18,2) NULL,
        \`currency\` varchar(8) NOT NULL DEFAULT 'AED',
        \`details\` json NULL,
        \`version\` int NOT NULL DEFAULT 1,
        \`isCurrent\` tinyint NOT NULL DEFAULT 1,
        \`createdBy\` varchar(128) NULL,
        INDEX \`IDX_pkg_project\` (\`projectBusinessKey\`),
        INDEX \`IDX_pkg_bizkey\` (\`businessKey\`),
        INDEX \`IDX_pkg_category\` (\`category\`),
        INDEX \`IDX_pkg_status\` (\`status\`),
        INDEX \`IDX_pkg_current\` (\`isCurrent\`),
        INDEX \`IDX_pkg_proj_current\` (\`projectBusinessKey\`, \`isCurrent\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`procurement_finding\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`projectBusinessKey\` varchar(64) NOT NULL,
        \`findingType\` varchar(32) NOT NULL,
        \`severity\` varchar(16) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`description\` text NOT NULL,
        \`refs\` json NOT NULL,
        \`recommendation\` text NULL,
        \`status\` varchar(16) NOT NULL DEFAULT 'open',
        \`dedupKey\` varchar(160) NOT NULL,
        INDEX \`IDX_prfind_project\` (\`projectBusinessKey\`),
        INDEX \`IDX_prfind_type\` (\`findingType\`),
        INDEX \`IDX_prfind_status\` (\`status\`),
        INDEX \`IDX_prfind_dedup\` (\`dedupKey\`),
        INDEX \`IDX_prfind_proj_status\` (\`projectBusinessKey\`, \`status\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `procurement_finding`');
    await queryRunner.query('DROP TABLE `procurement_package`');
    await queryRunner.query('DROP TABLE `vendor`');
    await queryRunner.query('DROP TABLE `qs_finding`');
    await queryRunner.query('DROP TABLE `cost_estimate`');
  }
}
