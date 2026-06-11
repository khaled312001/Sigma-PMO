import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Governance OS — Phase 1 foundation (2026-06-11 vision).
 *
 * Additive only, fully backward-compatible:
 *  - 5 new tables: enterprise, portfolio, program, agent_execution,
 *    governance_status_snapshot.
 *  - 5 new NULLABLE columns on `project` (hierarchy ancestry + lifecycle +
 *    status) — no defaults, so the append-only ingestion write path is
 *    untouched and existing rows stay valid.
 *  - composite indexes following the AddIndexes precedent.
 */
export class GovernanceOsPhase11781000000000 implements MigrationInterface {
  name = 'GovernanceOsPhase11781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── TraceableEntity column block shared by the 3 hierarchy tables ──
    const traceCols = `
      \`id\` char(36) NOT NULL,
      \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      \`ingestionRunId\` char(36) NOT NULL,
      \`sourceFileId\` char(36) NOT NULL,
      \`businessKey\` varchar(255) NOT NULL,
      \`version\` int NOT NULL DEFAULT 1,
      \`isCurrent\` tinyint NOT NULL DEFAULT 1,
      \`rawSource\` json NOT NULL,
    `;

    await queryRunner.query(`
      CREATE TABLE \`enterprise\` (
        ${traceCols}
        \`name\` varchar(255) NOT NULL,
        \`description\` varchar(512) NULL,
        \`governanceStatus\` varchar(16) NOT NULL DEFAULT 'green',
        INDEX \`IDX_enterprise_bizkey\` (\`businessKey\`),
        INDEX \`IDX_enterprise_current\` (\`isCurrent\`),
        INDEX \`IDX_enterprise_status\` (\`governanceStatus\`),
        INDEX \`IDX_enterprise_bizkey_current\` (\`businessKey\`, \`isCurrent\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`portfolio\` (
        ${traceCols}
        \`name\` varchar(255) NOT NULL,
        \`description\` varchar(512) NULL,
        \`enterpriseBusinessKey\` varchar(64) NULL,
        \`strategicAlignment\` varchar(512) NULL,
        \`governanceStatus\` varchar(16) NOT NULL DEFAULT 'green',
        INDEX \`IDX_portfolio_bizkey\` (\`businessKey\`),
        INDEX \`IDX_portfolio_current\` (\`isCurrent\`),
        INDEX \`IDX_portfolio_enterprise\` (\`enterpriseBusinessKey\`),
        INDEX \`IDX_portfolio_status\` (\`governanceStatus\`),
        INDEX \`IDX_portfolio_bizkey_current\` (\`businessKey\`, \`isCurrent\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`program\` (
        ${traceCols}
        \`name\` varchar(255) NOT NULL,
        \`description\` varchar(512) NULL,
        \`portfolioBusinessKey\` varchar(64) NULL,
        \`governanceOwner\` varchar(128) NULL,
        \`currentPhase\` varchar(32) NULL,
        \`governanceStatus\` varchar(16) NOT NULL DEFAULT 'green',
        INDEX \`IDX_program_bizkey\` (\`businessKey\`),
        INDEX \`IDX_program_current\` (\`isCurrent\`),
        INDEX \`IDX_program_portfolio\` (\`portfolioBusinessKey\`),
        INDEX \`IDX_program_status\` (\`governanceStatus\`),
        INDEX \`IDX_program_bizkey_current\` (\`businessKey\`, \`isCurrent\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`agent_execution\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`agentKey\` varchar(64) NOT NULL,
        \`agentLayer\` varchar(32) NOT NULL,
        \`personaSlug\` varchar(64) NULL,
        \`personaVersion\` int NULL,
        \`nodeType\` varchar(16) NULL,
        \`nodeBusinessKey\` varchar(64) NULL,
        \`lifecyclePhase\` varchar(32) NULL,
        \`inputRefs\` json NOT NULL,
        \`outputRefs\` json NULL,
        \`confidenceScoreId\` char(36) NULL,
        \`confidenceOverall\` double NULL,
        \`escalationLevel\` varchar(8) NULL,
        \`governanceStatus\` varchar(16) NULL,
        \`status\` varchar(16) NOT NULL,
        \`failureReason\` text NULL,
        \`correlationId\` char(36) NULL,
        \`startedAt\` datetime(6) NULL,
        \`finishedAt\` datetime(6) NULL,
        INDEX \`IDX_agent_exec_key\` (\`agentKey\`),
        INDEX \`IDX_agent_exec_node\` (\`nodeBusinessKey\`),
        INDEX \`IDX_agent_exec_corr\` (\`correlationId\`),
        INDEX \`IDX_agent_exec_layer_status\` (\`agentLayer\`, \`status\`),
        INDEX \`IDX_agent_exec_node_created\` (\`nodeType\`, \`nodeBusinessKey\`, \`createdAt\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`governance_status_snapshot\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`nodeType\` varchar(16) NOT NULL,
        \`nodeBusinessKey\` varchar(64) NOT NULL,
        \`status\` varchar(16) NOT NULL,
        \`score\` double NOT NULL,
        \`inputs\` json NOT NULL,
        \`computedAt\` datetime(6) NOT NULL,
        INDEX \`IDX_gss_node\` (\`nodeBusinessKey\`),
        INDEX \`IDX_gss_computed\` (\`computedAt\`),
        INDEX \`IDX_gss_node_computed\` (\`nodeType\`, \`nodeBusinessKey\`, \`computedAt\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── Additive NULLABLE columns on project (no defaults) ──
    await queryRunner.query(`ALTER TABLE \`project\` ADD COLUMN \`programBusinessKey\` varchar(64) NULL`);
    await queryRunner.query(`ALTER TABLE \`project\` ADD COLUMN \`portfolioBusinessKey\` varchar(64) NULL`);
    await queryRunner.query(`ALTER TABLE \`project\` ADD COLUMN \`enterpriseBusinessKey\` varchar(64) NULL`);
    await queryRunner.query(`ALTER TABLE \`project\` ADD COLUMN \`lifecyclePhase\` varchar(32) NULL`);
    await queryRunner.query(`ALTER TABLE \`project\` ADD COLUMN \`governanceStatus\` varchar(16) NULL`);
    await queryRunner.query(`CREATE INDEX \`IDX_project_program\` ON \`project\` (\`programBusinessKey\`)`);
    await queryRunner.query(`CREATE INDEX \`IDX_project_portfolio\` ON \`project\` (\`portfolioBusinessKey\`)`);
    await queryRunner.query(`CREATE INDEX \`IDX_project_enterprise\` ON \`project\` (\`enterpriseBusinessKey\`)`);
    await queryRunner.query(`CREATE INDEX \`IDX_project_gov_status\` ON \`project\` (\`governanceStatus\`)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`IDX_project_gov_status\` ON \`project\``);
    await queryRunner.query(`DROP INDEX \`IDX_project_enterprise\` ON \`project\``);
    await queryRunner.query(`DROP INDEX \`IDX_project_portfolio\` ON \`project\``);
    await queryRunner.query(`DROP INDEX \`IDX_project_program\` ON \`project\``);
    await queryRunner.query(`ALTER TABLE \`project\` DROP COLUMN \`governanceStatus\``);
    await queryRunner.query(`ALTER TABLE \`project\` DROP COLUMN \`lifecyclePhase\``);
    await queryRunner.query(`ALTER TABLE \`project\` DROP COLUMN \`enterpriseBusinessKey\``);
    await queryRunner.query(`ALTER TABLE \`project\` DROP COLUMN \`portfolioBusinessKey\``);
    await queryRunner.query(`ALTER TABLE \`project\` DROP COLUMN \`programBusinessKey\``);
    await queryRunner.query(`DROP TABLE \`governance_status_snapshot\``);
    await queryRunner.query(`DROP TABLE \`agent_execution\``);
    await queryRunner.query(`DROP TABLE \`program\``);
    await queryRunner.query(`DROP TABLE \`portfolio\``);
    await queryRunner.query(`DROP TABLE \`enterprise\``);
  }
}
