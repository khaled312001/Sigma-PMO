import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Governance decision category (Req R7, Mr. Ayham acceptance) — add a single
 * `category` classification to `governance_decision` so the platform can mark
 * whether a recommendation is financial / contractual / safety / schedule /
 * quality / operational / general. The category drives the NO-auto-approval
 * guard: financial | contractual | safety decisions can NEVER be auto-approved
 * and always require an explicit human action (belt-and-suspenders on top of the
 * existing human-only review flow). Derived deterministically at decision
 * assembly time from the triggering alert (FIDIC clause / alert code).
 *
 *   - category   (varchar 24 NULL) — financial | contractual | safety |
 *                                     schedule | quality | operational | general
 *
 * Nullable/additive — existing rows unaffected (read as `general` by the
 * envelope's derivation fallback until re-assembled).
 */
export class GovernanceDecisionCategory1784000000000 implements MigrationInterface {
  name = 'GovernanceDecisionCategory1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('governance_decision');
    if (!table) return;

    const adds: Array<[string, string]> = [
      ['category', 'varchar(24) NULL'],
    ];
    for (const [col, def] of adds) {
      if (!table.findColumnByName(col)) {
        await queryRunner.query(`ALTER TABLE \`governance_decision\` ADD \`${col}\` ${def}`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('governance_decision');
    if (!table) return;
    for (const col of ['category']) {
      if (table.findColumnByName(col)) {
        await queryRunner.query(`ALTER TABLE \`governance_decision\` DROP COLUMN \`${col}\``);
      }
    }
  }
}
