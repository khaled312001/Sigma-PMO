import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Billing + deeper tenant isolation (2026-06-18, follow-up to Tenancy). Adds:
 *  - Stripe linkage + trial columns on `subscription`.
 *  - `companyId` on `ingestion_run` and the three investment-spine tables
 *    (`investment_opportunity`, `opportunity_screening`, `feasibility_assessment`)
 *    so those surfaces isolate per company directly (the rest inherit scope via
 *    their owning project). All additive + nullable; existing rows backfill to the
 *    "default" company created by the Tenancy migration. Mirrors the dev helper
 *    scripts `apply-billing-dev.ts` + `apply-isolation-dev.ts`.
 */
export class BillingAndIsolation1787100000000 implements MigrationInterface {
  name = 'BillingAndIsolation1787100000000';

  private readonly DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

  /** Tables that gain a `companyId` + get backfilled to the default company. */
  private readonly COMPANY_SCOPED = [
    'ingestion_run',
    'investment_opportunity',
    'opportunity_screening',
    'feasibility_assessment',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Stripe billing columns on subscription.
    await queryRunner.query(`ALTER TABLE \`subscription\` ADD \`stripeCustomerId\` varchar(64) NULL`);
    await queryRunner.query(`ALTER TABLE \`subscription\` ADD \`stripeSubscriptionId\` varchar(64) NULL`);
    await queryRunner.query(`ALTER TABLE \`subscription\` ADD \`trialEndsAt\` datetime NULL`);
    await queryRunner.query(`ALTER TABLE \`subscription\` ADD \`currentPeriodEnd\` datetime NULL`);
    await queryRunner.query(
      `CREATE INDEX \`IDX_subscription_stripeSub\` ON \`subscription\` (\`stripeSubscriptionId\`)`,
    );

    // 2) companyId on ingestion_run + the investment spine, with backfill.
    for (const t of this.COMPANY_SCOPED) {
      await queryRunner.query(`ALTER TABLE \`${t}\` ADD \`companyId\` char(36) NULL`);
      await queryRunner.query(`CREATE INDEX \`IDX_${t}_companyId\` ON \`${t}\` (\`companyId\`)`);
      await queryRunner.query(`UPDATE \`${t}\` SET \`companyId\` = ? WHERE \`companyId\` IS NULL`, [
        this.DEFAULT_COMPANY_ID,
      ]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const t of this.COMPANY_SCOPED) {
      await queryRunner.query(`DROP INDEX \`IDX_${t}_companyId\` ON \`${t}\``);
      await queryRunner.query(`ALTER TABLE \`${t}\` DROP COLUMN \`companyId\``);
    }
    await queryRunner.query(`DROP INDEX \`IDX_subscription_stripeSub\` ON \`subscription\``);
    await queryRunner.query(`ALTER TABLE \`subscription\` DROP COLUMN \`currentPeriodEnd\``);
    await queryRunner.query(`ALTER TABLE \`subscription\` DROP COLUMN \`trialEndsAt\``);
    await queryRunner.query(`ALTER TABLE \`subscription\` DROP COLUMN \`stripeSubscriptionId\``);
    await queryRunner.query(`ALTER TABLE \`subscription\` DROP COLUMN \`stripeCustomerId\``);
  }
}
