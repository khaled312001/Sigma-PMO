import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * journeyCorrelationId pipeline (Mr. Ayham acceptance 2026-06-28, "the one
 * pipeline"): one id threads the cross-module journey sketch → feasibility →
 * BIM → BoQ → schedule → contract → site-evidence → report → decision. We add a
 * nullable, indexed `journeyCorrelationId char(36)` to every entity that takes
 * part in that chain, plus a nullable indexed `opportunityId` on `project` that
 * welds the investment half (opportunity → feasibility → study) to the
 * construction half (drawings → BoQ → schedule → … → decision). Additive only —
 * every column is nullable with no backfill; existing rows keep working
 * (journeyCorrelationId is mostly null until the seed stamps it).
 */
export class JourneyCorrelation1783000000000 implements MigrationInterface {
  name = 'JourneyCorrelation1783000000000';

  /** Tables that gain the nullable indexed `journeyCorrelationId` column. */
  private static readonly JOURNEY_TABLES = [
    'investment_opportunity',
    'concept_document',
    'feasibility_assessment',
    'feasibility_study_section',
    'drawing_package',
    'boq',
    'monthly_report',
    'governance_decision',
    'lifecycle_ledger',
    'evidence_room',
    'project',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of JourneyCorrelation1783000000000.JOURNEY_TABLES) {
      const t = await queryRunner.getTable(table);
      if (t && !t.findColumnByName('journeyCorrelationId')) {
        await queryRunner.query(`ALTER TABLE \`${table}\` ADD \`journeyCorrelationId\` char(36) NULL`);
        await queryRunner.query(`CREATE INDEX \`IDX_${table}_journeyCorrelationId\` ON \`${table}\` (\`journeyCorrelationId\`)`);
      }
    }

    // Welds the investment half to the construction half.
    const project = await queryRunner.getTable('project');
    if (project && !project.findColumnByName('opportunityId')) {
      await queryRunner.query('ALTER TABLE `project` ADD `opportunityId` char(36) NULL');
      await queryRunner.query('CREATE INDEX `IDX_project_opportunityId` ON `project` (`opportunityId`)');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const project = await queryRunner.getTable('project');
    if (project && project.findColumnByName('opportunityId')) {
      await queryRunner.query('DROP INDEX `IDX_project_opportunityId` ON `project`');
      await queryRunner.query('ALTER TABLE `project` DROP COLUMN `opportunityId`');
    }

    for (const table of JourneyCorrelation1783000000000.JOURNEY_TABLES) {
      const t = await queryRunner.getTable(table);
      if (t && t.findColumnByName('journeyCorrelationId')) {
        await queryRunner.query(`DROP INDEX \`IDX_${table}_journeyCorrelationId\` ON \`${table}\``);
        await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN \`journeyCorrelationId\``);
      }
    }
  }
}
