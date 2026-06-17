import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-tenant SaaS foundation (2026-06-18): the `company` (tenant) table, a
 * `companyId` scope column on the User + the 9 TraceableEntity-derived core
 * tables, and a backfilled "default" company so all pre-SaaS single-tenant data
 * (and the running platform) keep working. Additive + nullable — zero data loss.
 * Downstream entities (alerts, decisions, reports…) inherit company scope through
 * their owning project; isolation is enforced at the project/auth layer.
 */
export class Tenancy1787000000000 implements MigrationInterface {
  name = 'Tenancy1787000000000';

  /** Stable id for the backfill company (pre-SaaS data belongs here). */
  private readonly DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

  /** Tables that extend TraceableEntity (get companyId via the base class). */
  private readonly TRACEABLE_TABLES = [
    'activity',
    'enterprise',
    'portfolio',
    'program',
    'project',
    'project_record',
    'report',
    'resource',
    'resource_assignment',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) The company (tenant) table.
    await queryRunner.query(`
      CREATE TABLE \`company\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`slug\` varchar(120) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`companyType\` varchar(32) NOT NULL,
        \`status\` varchar(16) NOT NULL DEFAULT 'trial',
        \`plan\` varchar(32) NOT NULL DEFAULT 'trial',
        \`ownerEmail\` varchar(320) NULL,
        \`logoKey\` varchar(512) NULL,
        \`country\` varchar(2) NULL,
        \`createdById\` char(36) NULL,
        UNIQUE INDEX \`UQ_company_slug\` (\`slug\`),
        INDEX \`IDX_company_companyType\` (\`companyType\`),
        INDEX \`IDX_company_status\` (\`status\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    // 2) The backfill "default" company for all existing single-tenant data.
    await queryRunner.query(
      `INSERT INTO \`company\` (\`id\`, \`slug\`, \`name\`, \`companyType\`, \`status\`, \`plan\`)
       VALUES (?, 'sigma-default', 'Sigma (default)', 'pmo', 'active', 'enterprise')`,
      [this.DEFAULT_COMPANY_ID],
    );

    // 2b) Per-company subscription + support/request tables (super-admin surface).
    await queryRunner.query(`
      CREATE TABLE \`subscription\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`companyId\` char(36) NOT NULL,
        \`plan\` varchar(32) NOT NULL DEFAULT 'trial',
        \`status\` varchar(16) NOT NULL DEFAULT 'trial',
        \`seats\` int NOT NULL DEFAULT 1,
        \`startedAt\` date NULL,
        \`renewsAt\` date NULL,
        \`mrr\` decimal(12,2) NOT NULL DEFAULT '0.00',
        UNIQUE INDEX \`UQ_subscription_company\` (\`companyId\`),
        INDEX \`IDX_subscription_status\` (\`status\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE \`support_request\` (
        \`id\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`companyId\` char(36) NOT NULL,
        \`kind\` varchar(32) NOT NULL DEFAULT 'support',
        \`subject\` varchar(255) NOT NULL,
        \`body\` text NULL,
        \`status\` varchar(16) NOT NULL DEFAULT 'open',
        \`createdByEmail\` varchar(320) NULL,
        \`reply\` text NULL,
        INDEX \`IDX_support_company\` (\`companyId\`),
        INDEX \`IDX_support_status\` (\`status\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    // 3) companyId on the User table (NULL = platform SUPER_ADMIN).
    await queryRunner.query(`ALTER TABLE \`user\` ADD \`companyId\` char(36) NULL`);
    await queryRunner.query(`CREATE INDEX \`IDX_user_companyId\` ON \`user\` (\`companyId\`)`);
    await queryRunner.query(`UPDATE \`user\` SET \`companyId\` = ? WHERE \`companyId\` IS NULL`, [
      this.DEFAULT_COMPANY_ID,
    ]);

    // 4) companyId on every TraceableEntity-derived core table + backfill.
    for (const t of this.TRACEABLE_TABLES) {
      await queryRunner.query(`ALTER TABLE \`${t}\` ADD \`companyId\` char(36) NULL`);
      await queryRunner.query(`CREATE INDEX \`IDX_${t}_companyId\` ON \`${t}\` (\`companyId\`)`);
      await queryRunner.query(`UPDATE \`${t}\` SET \`companyId\` = ? WHERE \`companyId\` IS NULL`, [
        this.DEFAULT_COMPANY_ID,
      ]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const t of this.TRACEABLE_TABLES) {
      await queryRunner.query(`DROP INDEX \`IDX_${t}_companyId\` ON \`${t}\``);
      await queryRunner.query(`ALTER TABLE \`${t}\` DROP COLUMN \`companyId\``);
    }
    await queryRunner.query(`DROP INDEX \`IDX_user_companyId\` ON \`user\``);
    await queryRunner.query(`ALTER TABLE \`user\` DROP COLUMN \`companyId\``);
    await queryRunner.query(`DROP TABLE \`support_request\``);
    await queryRunner.query(`DROP TABLE \`subscription\``);
    await queryRunner.query(`DROP TABLE \`company\``);
  }
}
