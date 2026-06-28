import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Primavera CPM linkage (Mr. Ayham acceptance 2026-06-28): parse the P6 logic
 * network so critical-path / EOT is CPM-driven, and a clash / long-lead change
 * can be tied to a critical activity. Adds to `activity`:
 *   - `totalFloat` (int, days)        — P6 total_float_hr_cnt ÷ 8 / PMXML TotalFloat
 *   - `isCritical` (boolean)          — P6 driving_path_flag / PMXML IsCritical
 *   - `predecessors` (json)           — [{ activityKey, type, lagDays }]
 * and to `procurement_package`:
 *   - `activityBusinessKey` (varchar) — maps a (long-lead) package to a P6 activity.
 * Additive only — every column is nullable / defaulted; existing rows unaffected.
 */
export class ActivityCpmLinkage1783300000000 implements MigrationInterface {
  name = 'ActivityCpmLinkage1783300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const activity = await queryRunner.getTable('activity');
    if (activity && !activity.findColumnByName('totalFloat')) {
      await queryRunner.query('ALTER TABLE `activity` ADD `totalFloat` int NULL');
    }
    if (activity && !activity.findColumnByName('isCritical')) {
      await queryRunner.query('ALTER TABLE `activity` ADD `isCritical` tinyint NOT NULL DEFAULT 0');
    }
    if (activity && !activity.findColumnByName('predecessors')) {
      await queryRunner.query('ALTER TABLE `activity` ADD `predecessors` json NULL');
    }

    const pkg = await queryRunner.getTable('procurement_package');
    if (pkg && !pkg.findColumnByName('activityBusinessKey')) {
      await queryRunner.query('ALTER TABLE `procurement_package` ADD `activityBusinessKey` varchar(64) NULL');
      await queryRunner.query('CREATE INDEX `IDX_procurement_package_activityKey` ON `procurement_package` (`activityBusinessKey`)');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const pkg = await queryRunner.getTable('procurement_package');
    if (pkg && pkg.findColumnByName('activityBusinessKey')) {
      await queryRunner.query('DROP INDEX `IDX_procurement_package_activityKey` ON `procurement_package`');
      await queryRunner.query('ALTER TABLE `procurement_package` DROP COLUMN `activityBusinessKey`');
    }

    const activity = await queryRunner.getTable('activity');
    for (const col of ['predecessors', 'isCritical', 'totalFloat']) {
      if (activity && activity.findColumnByName(col)) {
        await queryRunner.query(`ALTER TABLE \`activity\` DROP COLUMN \`${col}\``);
      }
    }
  }
}
