import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quantity + Cost Governance traceability ledger (Mr. Ayham, 2026-06-12
 * follow-up). One additive table — the append-only lifecycle ledger tracking
 * every number through its chain (BIM→…→Paid / Budget→…→Final) with full
 * provenance (origin, change reason, approver, evidence).
 */
export class LifecycleLedger1784000000000 implements MigrationInterface {
  name = 'LifecycleLedger1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`lifecycle_ledger\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`projectBusinessKey\` varchar(64) NOT NULL,
        \`dimension\` varchar(16) NOT NULL,
        \`subjectKey\` varchar(128) NOT NULL,
        \`subjectLabel\` varchar(255) NOT NULL,
        \`stage\` varchar(24) NOT NULL,
        \`value\` decimal(18,4) NOT NULL,
        \`unit\` varchar(16) NULL,
        \`currency\` varchar(8) NULL,
        \`originType\` varchar(32) NOT NULL,
        \`originRef\` varchar(128) NULL,
        \`changeReason\` varchar(512) NULL,
        \`approvedBy\` varchar(128) NULL,
        \`evidenceRefs\` json NULL,
        \`supersedesId\` char(36) NULL,
        \`isCurrent\` tinyint NOT NULL DEFAULT 1,
        \`recordedBy\` varchar(128) NULL,
        INDEX \`IDX_ledger_project\` (\`projectBusinessKey\`),
        INDEX \`IDX_ledger_dimension\` (\`dimension\`),
        INDEX \`IDX_ledger_subject\` (\`subjectKey\`),
        INDEX \`IDX_ledger_stage\` (\`stage\`),
        INDEX \`IDX_ledger_current\` (\`isCurrent\`),
        INDEX \`IDX_ledger_chain\` (\`projectBusinessKey\`, \`dimension\`, \`subjectKey\`, \`stage\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `lifecycle_ledger`');
  }
}
