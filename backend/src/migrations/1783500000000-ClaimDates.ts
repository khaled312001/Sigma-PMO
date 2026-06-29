import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Claim procedural dates (Mr. Ayham acceptance 2026-06-28 — auto-join the FIDIC
 * verdict into the claim chain). Adds to `claim`:
 *   - `delayEventDate` (date)   — the underlying delay/contract-event date the
 *                                 procedural clock (FIDIC 20.1) runs from.
 *   - `noticeServedDate` (date) — when notice of the claim was served.
 * Both nullable/additive — the forensic chain falls back to the earliest linked
 * letter date when absent. Existing rows unaffected.
 */
export class ClaimDates1783500000000 implements MigrationInterface {
  name = 'ClaimDates1783500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('claim');
    if (table && !table.findColumnByName('delayEventDate')) {
      await queryRunner.query('ALTER TABLE `claim` ADD `delayEventDate` date NULL');
    }
    if (table && !table.findColumnByName('noticeServedDate')) {
      await queryRunner.query('ALTER TABLE `claim` ADD `noticeServedDate` date NULL');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('claim');
    for (const col of ['noticeServedDate', 'delayEventDate']) {
      if (table && table.findColumnByName(col)) {
        await queryRunner.query(`ALTER TABLE \`claim\` DROP COLUMN \`${col}\``);
      }
    }
  }
}
