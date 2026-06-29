import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Feasibility → project linkage (Mr. Ayham acceptance 2026-06-28). Adds
 * `projectBusinessKey` to `feasibility_assessment` so a project-scoped
 * assessment can be resolved by project ("bankability for P-1000" binds to the
 * P-1000 opportunity assessment instead of the globally-latest unrelated run).
 * Additive only — nullable, indexed; existing rows unaffected (null = global).
 */
export class FeasibilityProjectKey1783400000000 implements MigrationInterface {
  name = 'FeasibilityProjectKey1783400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('feasibility_assessment');
    if (table && !table.findColumnByName('projectBusinessKey')) {
      await queryRunner.query(
        'ALTER TABLE `feasibility_assessment` ADD `projectBusinessKey` varchar(64) NULL',
      );
      await queryRunner.query(
        'CREATE INDEX `IDX_feasibility_assessment_projectKey` ON `feasibility_assessment` (`projectBusinessKey`)',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('feasibility_assessment');
    if (table && table.findColumnByName('projectBusinessKey')) {
      await queryRunner.query(
        'DROP INDEX `IDX_feasibility_assessment_projectKey` ON `feasibility_assessment`',
      );
      await queryRunner.query(
        'ALTER TABLE `feasibility_assessment` DROP COLUMN `projectBusinessKey`',
      );
    }
  }
}
