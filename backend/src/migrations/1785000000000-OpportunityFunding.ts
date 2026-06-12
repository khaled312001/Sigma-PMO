import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Opportunity Intelligence + Funding Governance (Mr. Ayham, 2026-06-12 active
 * scope). Additive only — 2 new tables: opportunity_screening (pre-feasibility
 * screening) and funding_facility (loan facilities / DSCR / covenants).
 */
export class OpportunityFunding1785000000000 implements MigrationInterface {
  name = 'OpportunityFunding1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`opportunity_screening\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`code\` varchar(32) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`projectType\` varchar(48) NOT NULL,
        \`country\` varchar(64) NULL,
        \`city\` varchar(64) NULL,
        \`estimatedInvestment\` decimal(18,2) NULL,
        \`currency\` varchar(8) NOT NULL DEFAULT 'AED',
        \`inputs\` json NOT NULL,
        \`scores\` json NOT NULL,
        \`opportunityScore\` double NOT NULL,
        \`recommendation\` varchar(32) NOT NULL,
        \`governanceStatus\` varchar(16) NOT NULL,
        \`createdBy\` varchar(128) NULL,
        UNIQUE INDEX \`IDX_oppscr_code\` (\`code\`),
        INDEX \`IDX_oppscr_type\` (\`projectType\`),
        INDEX \`IDX_oppscr_rec\` (\`recommendation\`),
        INDEX \`IDX_oppscr_type_rec\` (\`projectType\`, \`recommendation\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`funding_facility\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`projectBusinessKey\` varchar(64) NOT NULL,
        \`businessKey\` varchar(64) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`lenderName\` varchar(128) NULL,
        \`facilityType\` varchar(24) NOT NULL,
        \`amount\` decimal(18,2) NOT NULL,
        \`currency\` varchar(8) NOT NULL DEFAULT 'AED',
        \`interestRatePct\` double NULL,
        \`tenorYears\` int NULL,
        \`drawnAmount\` decimal(18,2) NOT NULL DEFAULT 0,
        \`repaidAmount\` decimal(18,2) NOT NULL DEFAULT 0,
        \`dscrCovenant\` double NULL,
        \`currentDscr\` double NULL,
        \`maturityDate\` date NULL,
        \`status\` varchar(16) NOT NULL DEFAULT 'active',
        \`details\` json NULL,
        \`version\` int NOT NULL DEFAULT 1,
        \`isCurrent\` tinyint NOT NULL DEFAULT 1,
        \`createdBy\` varchar(128) NULL,
        INDEX \`IDX_fac_project\` (\`projectBusinessKey\`),
        INDEX \`IDX_fac_bizkey\` (\`businessKey\`),
        INDEX \`IDX_fac_status\` (\`status\`),
        INDEX \`IDX_fac_current\` (\`isCurrent\`),
        INDEX \`IDX_fac_proj_current\` (\`projectBusinessKey\`, \`isCurrent\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `funding_facility`');
    await queryRunner.query('DROP TABLE `opportunity_screening`');
  }
}
