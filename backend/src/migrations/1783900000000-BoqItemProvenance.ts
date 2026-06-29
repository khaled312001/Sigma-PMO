import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-BOQ-item provenance columns (Req 5, Mr. Ayham acceptance) — widen
 * `boq_item` so each line carries the explicit traceability link the BOQ/Cost
 * traceability panel reports: which BIM element the quantity came from, the
 * classification code, and which pricing library/source set the rate. Adds to
 * `boq_item`:
 *   - bimElementGuid          (varchar 128) — IFC GlobalId / Revit element id
 *   - classificationStandard  (varchar 16)  — NRM | UNIFORMAT | MASTERFORMAT | CESMM
 *   - classificationCode      (varchar 32)  — code within that standard
 *   - pricingLibrary          (varchar 64)  — rate/pricing library or source
 * All nullable/additive — existing rows unaffected. The assembly endpoint
 * falls back to the lifecycle ledger + CostEstimate elements when null.
 */
export class BoqItemProvenance1783900000000 implements MigrationInterface {
  name = 'BoqItemProvenance1783900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('boq_item');
    if (!table) return;

    const adds: Array<[string, string]> = [
      ['bimElementGuid', 'varchar(128) NULL'],
      ['classificationStandard', 'varchar(16) NULL'],
      ['classificationCode', 'varchar(32) NULL'],
      ['pricingLibrary', 'varchar(64) NULL'],
    ];
    for (const [col, def] of adds) {
      if (!table.findColumnByName(col)) {
        await queryRunner.query(`ALTER TABLE \`boq_item\` ADD \`${col}\` ${def}`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('boq_item');
    if (!table) return;
    for (const col of [
      'pricingLibrary',
      'classificationCode',
      'classificationStandard',
      'bimElementGuid',
    ]) {
      if (table.findColumnByName(col)) {
        await queryRunner.query(`ALTER TABLE \`boq_item\` DROP COLUMN \`${col}\``);
      }
    }
  }
}
