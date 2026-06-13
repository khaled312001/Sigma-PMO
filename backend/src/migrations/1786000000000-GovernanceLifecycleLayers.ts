import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Full governance lifecycle (Mr. Ayham, 2026-06-13): the five new site-governance
 * layers — Safety, Fire & Life Safety, Authority, Utility, Operational Readiness.
 * Additive only — 5 new tables, each append-only by (businessKey, isCurrent) with
 * the same conventions as funding_facility. Bankability Intelligence adds NO table
 * (it reads FeasibilityAssessment + FundingFacility).
 */
export class GovernanceLifecycleLayers1786000000000 implements MigrationInterface {
  name = 'GovernanceLifecycleLayers1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Safety Governance ──
    await queryRunner.query(`
      CREATE TABLE \`safety_record\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`projectBusinessKey\` varchar(64) NOT NULL,
        \`businessKey\` varchar(64) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`recordType\` varchar(32) NOT NULL,
        \`severity\` varchar(16) NULL,
        \`status\` varchar(16) NOT NULL DEFAULT 'open',
        \`recordDate\` date NULL,
        \`stopWork\` tinyint NOT NULL DEFAULT 0,
        \`affectedActivityKeys\` json NULL,
        \`eotDays\` int NULL,
        \`details\` json NULL,
        \`version\` int NOT NULL DEFAULT 1,
        \`isCurrent\` tinyint NOT NULL DEFAULT 1,
        \`createdBy\` varchar(128) NULL,
        INDEX \`IDX_saf_project\` (\`projectBusinessKey\`),
        INDEX \`IDX_saf_bizkey\` (\`businessKey\`),
        INDEX \`IDX_saf_current\` (\`isCurrent\`),
        INDEX \`IDX_saf_proj_current\` (\`projectBusinessKey\`, \`isCurrent\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── Fire & Life Safety Governance ──
    await queryRunner.query(`
      CREATE TABLE \`fire_safety_record\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`projectBusinessKey\` varchar(64) NOT NULL,
        \`businessKey\` varchar(64) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`recordType\` varchar(32) NOT NULL,
        \`authority\` varchar(64) NULL,
        \`status\` varchar(24) NOT NULL DEFAULT 'submitted',
        \`openComments\` int NOT NULL DEFAULT 0,
        \`submittedDate\` date NULL,
        \`approvalForecastDate\` date NULL,
        \`severity\` varchar(16) NULL,
        \`details\` json NULL,
        \`version\` int NOT NULL DEFAULT 1,
        \`isCurrent\` tinyint NOT NULL DEFAULT 1,
        \`createdBy\` varchar(128) NULL,
        INDEX \`IDX_fls_project\` (\`projectBusinessKey\`),
        INDEX \`IDX_fls_bizkey\` (\`businessKey\`),
        INDEX \`IDX_fls_current\` (\`isCurrent\`),
        INDEX \`IDX_fls_proj_current\` (\`projectBusinessKey\`, \`isCurrent\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── Authority Governance ──
    await queryRunner.query(`
      CREATE TABLE \`authority_submission\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`projectBusinessKey\` varchar(64) NOT NULL,
        \`businessKey\` varchar(64) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`authority\` varchar(32) NOT NULL,
        \`submissionType\` varchar(64) NULL,
        \`status\` varchar(24) NOT NULL DEFAULT 'submitted',
        \`openComments\` int NOT NULL DEFAULT 0,
        \`submittedDate\` date NULL,
        \`forecastApprovalDate\` date NULL,
        \`requiredByDate\` date NULL,
        \`affectedActivityKeys\` json NULL,
        \`details\` json NULL,
        \`version\` int NOT NULL DEFAULT 1,
        \`isCurrent\` tinyint NOT NULL DEFAULT 1,
        \`createdBy\` varchar(128) NULL,
        INDEX \`IDX_auth_project\` (\`projectBusinessKey\`),
        INDEX \`IDX_auth_bizkey\` (\`businessKey\`),
        INDEX \`IDX_auth_current\` (\`isCurrent\`),
        INDEX \`IDX_auth_proj_current\` (\`projectBusinessKey\`, \`isCurrent\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── Utility Governance ──
    await queryRunner.query(`
      CREATE TABLE \`utility_connection\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`projectBusinessKey\` varchar(64) NOT NULL,
        \`businessKey\` varchar(64) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`utilityType\` varchar(24) NOT NULL,
        \`status\` varchar(24) NOT NULL DEFAULT 'not_started',
        \`applicationDate\` date NULL,
        \`forecastConnectionDate\` date NULL,
        \`requiredByDate\` date NULL,
        \`details\` json NULL,
        \`version\` int NOT NULL DEFAULT 1,
        \`isCurrent\` tinyint NOT NULL DEFAULT 1,
        \`createdBy\` varchar(128) NULL,
        INDEX \`IDX_utl_project\` (\`projectBusinessKey\`),
        INDEX \`IDX_utl_bizkey\` (\`businessKey\`),
        INDEX \`IDX_utl_current\` (\`isCurrent\`),
        INDEX \`IDX_utl_proj_current\` (\`projectBusinessKey\`, \`isCurrent\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── Operational Readiness Governance ──
    await queryRunner.query(`
      CREATE TABLE \`operational_readiness_item\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`projectBusinessKey\` varchar(64) NOT NULL,
        \`businessKey\` varchar(64) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`category\` varchar(32) NOT NULL,
        \`status\` varchar(24) NOT NULL DEFAULT 'not_started',
        \`completionPct\` double NULL,
        \`dueDate\` date NULL,
        \`details\` json NULL,
        \`version\` int NOT NULL DEFAULT 1,
        \`isCurrent\` tinyint NOT NULL DEFAULT 1,
        \`createdBy\` varchar(128) NULL,
        INDEX \`IDX_opr_project\` (\`projectBusinessKey\`),
        INDEX \`IDX_opr_bizkey\` (\`businessKey\`),
        INDEX \`IDX_opr_current\` (\`isCurrent\`),
        INDEX \`IDX_opr_proj_current\` (\`projectBusinessKey\`, \`isCurrent\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `operational_readiness_item`');
    await queryRunner.query('DROP TABLE `utility_connection`');
    await queryRunner.query('DROP TABLE `authority_submission`');
    await queryRunner.query('DROP TABLE `fire_safety_record`');
    await queryRunner.query('DROP TABLE `safety_record`');
  }
}
