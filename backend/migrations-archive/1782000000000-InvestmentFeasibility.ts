import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Investment & Feasibility Intelligence (Mr. Ayham, 2026-06-11 follow-up).
 *
 * Additive only — 4 new tables, zero changes to existing ones:
 *  - investment_opportunity   (the idea + its structured inputs)
 *  - feasibility_assessment   (append-only deterministic model runs)
 *  - feasibility_study_section (versioned Level-2 study sections)
 *  - concept_document         (sketch/PDF intake + human-gated AI extraction)
 */
export class InvestmentFeasibility1782000000000 implements MigrationInterface {
  name = 'InvestmentFeasibility1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`investment_opportunity\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`code\` varchar(32) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`projectType\` varchar(48) NOT NULL,
        \`country\` varchar(64) NULL,
        \`city\` varchar(64) NULL,
        \`estimatedInvestment\` decimal(18,2) NULL,
        \`currency\` varchar(8) NOT NULL DEFAULT 'AED',
        \`fundingStructure\` json NOT NULL,
        \`businessObjective\` text NULL,
        \`stage\` varchar(24) NOT NULL DEFAULT 'idea',
        \`inputs\` json NOT NULL,
        \`createdBy\` varchar(128) NULL,
        UNIQUE INDEX \`IDX_invopp_code\` (\`code\`),
        INDEX \`IDX_invopp_type\` (\`projectType\`),
        INDEX \`IDX_invopp_stage\` (\`stage\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`feasibility_assessment\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`opportunityId\` char(36) NOT NULL,
        \`level\` int NOT NULL DEFAULT 1,
        \`inputs\` json NOT NULL,
        \`assumptions\` json NOT NULL,
        \`results\` json NOT NULL,
        \`riskRating\` varchar(16) NOT NULL,
        \`recommendation\` varchar(32) NOT NULL,
        \`governanceStatus\` varchar(16) NOT NULL,
        \`confidence\` double NOT NULL,
        \`narrative\` text NULL,
        \`createdBy\` varchar(128) NULL,
        INDEX \`IDX_feasassess_opp\` (\`opportunityId\`),
        INDEX \`IDX_feasassess_rec\` (\`recommendation\`),
        INDEX \`IDX_feasassess_opp_created\` (\`opportunityId\`, \`createdAt\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`feasibility_study_section\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`opportunityId\` char(36) NOT NULL,
        \`sectionKey\` varchar(48) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`content\` longtext NOT NULL,
        \`data\` json NULL,
        \`version\` int NOT NULL DEFAULT 1,
        \`isCurrent\` tinyint NOT NULL DEFAULT 1,
        \`status\` varchar(16) NOT NULL DEFAULT 'generated',
        \`source\` varchar(16) NOT NULL DEFAULT 'deterministic',
        \`approvedBy\` varchar(128) NULL,
        INDEX \`IDX_feassec_opp\` (\`opportunityId\`),
        INDEX \`IDX_feassec_current\` (\`isCurrent\`),
        INDEX \`IDX_feassec_opp_key_current\` (\`opportunityId\`, \`sectionKey\`, \`isCurrent\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`concept_document\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`opportunityId\` char(36) NOT NULL,
        \`filename\` varchar(255) NOT NULL,
        \`mimeType\` varchar(64) NOT NULL,
        \`storedPath\` varchar(512) NOT NULL,
        \`sha256\` char(64) NOT NULL,
        \`sizeBytes\` int NOT NULL,
        \`extractionStatus\` varchar(16) NOT NULL DEFAULT 'pending',
        \`extraction\` json NULL,
        \`confirmedFields\` json NULL,
        \`extractionError\` varchar(512) NULL,
        \`uploadedBy\` varchar(128) NULL,
        \`confirmedBy\` varchar(128) NULL,
        INDEX \`IDX_conceptdoc_opp\` (\`opportunityId\`),
        INDEX \`IDX_conceptdoc_status\` (\`extractionStatus\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `concept_document`');
    await queryRunner.query('DROP TABLE `feasibility_study_section`');
    await queryRunner.query('DROP TABLE `feasibility_assessment`');
    await queryRunner.query('DROP TABLE `investment_opportunity`');
  }
}
