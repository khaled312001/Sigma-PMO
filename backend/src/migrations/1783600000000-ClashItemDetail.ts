import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-clash detail columns (Req 2, Mr. Ayham acceptance) — widen `clash_item`
 * so the clash detail view carries first-class typed fields instead of
 * re-parsing `description`. Populated by the native GeometricClashService and
 * by the Navisworks/Revit Excel ingest path. Adds to `clash_item`:
 *   - elementGuidA / elementGuidB      (varchar 128) — element GUIDs per side
 *   - locationX / locationY / locationZ (double, mm)  — world clash centroid
 *   - gridLocation                     (varchar 255) — axis/grid text
 *   - penetrationMm                    (double)      — penetration/clearance mm
 *   - snapshotImagePath                (varchar 512) — storage ref of snapshot
 *   - viewUrn                          (varchar 512) — Autodesk Viewer model URN
 *   - viewState                        (json)        — viewer camera/state
 *   - linkedActivityBusinessKey        (varchar 64)  — revised Activity key
 *   - responsibleParty                 (varchar 255) — resolving party
 * All nullable/additive — existing rows unaffected.
 */
export class ClashItemDetail1783600000000 implements MigrationInterface {
  name = 'ClashItemDetail1783600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('clash_item');
    if (!table) return;

    const adds: Array<[string, string]> = [
      ['elementGuidA', 'varchar(128) NULL'],
      ['elementGuidB', 'varchar(128) NULL'],
      ['locationX', 'double NULL'],
      ['locationY', 'double NULL'],
      ['locationZ', 'double NULL'],
      ['gridLocation', 'varchar(255) NULL'],
      ['penetrationMm', 'double NULL'],
      ['snapshotImagePath', 'varchar(512) NULL'],
      ['viewUrn', 'varchar(512) NULL'],
      ['viewState', 'json NULL'],
      ['linkedActivityBusinessKey', 'varchar(64) NULL'],
      ['responsibleParty', 'varchar(255) NULL'],
    ];
    for (const [col, def] of adds) {
      if (!table.findColumnByName(col)) {
        await queryRunner.query(`ALTER TABLE \`clash_item\` ADD \`${col}\` ${def}`);
      }
    }

    // Index linkedActivityBusinessKey for the forensic-chain join.
    const fresh = await queryRunner.getTable('clash_item');
    const hasIdx = fresh?.indices.some((i) => i.name === 'IDX_clash_item_linkedActivityKey');
    if (!hasIdx) {
      await queryRunner.query(
        'CREATE INDEX `IDX_clash_item_linkedActivityKey` ON `clash_item` (`linkedActivityBusinessKey`)',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('clash_item');
    if (!table) return;
    const idx = table.indices.find((i) => i.name === 'IDX_clash_item_linkedActivityKey');
    if (idx) {
      await queryRunner.query('DROP INDEX `IDX_clash_item_linkedActivityKey` ON `clash_item`');
    }
    for (const col of [
      'responsibleParty',
      'linkedActivityBusinessKey',
      'viewState',
      'viewUrn',
      'snapshotImagePath',
      'penetrationMm',
      'gridLocation',
      'locationZ',
      'locationY',
      'locationX',
      'elementGuidB',
      'elementGuidA',
    ]) {
      if (table.findColumnByName(col)) {
        await queryRunner.query(`ALTER TABLE \`clash_item\` DROP COLUMN \`${col}\``);
      }
    }
  }
}
