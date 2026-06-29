import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Project demo scenario archetype (Task 9, project-types story). Adds
 * `scenarioType` (varchar 32, nullable) to `project` so the project-types
 * demo can expose a `new-from-sketch` / `stalled` / `disputed` filter on
 * `GET /projects?scenarioType=`. Additive only — existing rows leave it null
 * and the filter ignores them.
 */
export class ProjectScenarioType1783700000000 implements MigrationInterface {
  name = 'ProjectScenarioType1783700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('project');
    if (table && !table.findColumnByName('scenarioType')) {
      await queryRunner.query('ALTER TABLE `project` ADD `scenarioType` varchar(32) NULL');
      await queryRunner.query('CREATE INDEX `IDX_project_scenarioType` ON `project` (`scenarioType`)');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('project');
    if (table && table.findColumnByName('scenarioType')) {
      const idx = table.indices.find((i) => i.name === 'IDX_project_scenarioType');
      if (idx) {
        await queryRunner.query('DROP INDEX `IDX_project_scenarioType` ON `project`');
      }
      await queryRunner.query('ALTER TABLE `project` DROP COLUMN `scenarioType`');
    }
  }
}
