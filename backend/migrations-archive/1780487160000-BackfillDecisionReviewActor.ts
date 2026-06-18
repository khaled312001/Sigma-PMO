import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Audit-trail backfill: every `decision_review` row recorded before the
 * `@RequiresCapability('canEvaluateRules')` gate landed on
 * `POST /governance/decisions/:id/review` could be persisted with NULL
 * actor. Going forward the service throws on null actor (see
 * decision-review.service.ts). This migration tags any historical anonymous
 * rows so the audit trail is honest rather than empty.
 *
 * Idempotent: re-running only affects rows still NULL on both attribution
 * columns.
 */
export class BackfillDecisionReviewActor1780487160000 implements MigrationInterface {
  name = 'BackfillDecisionReviewActor1780487160000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE \`decision_review\`
         SET \`performedByDisplay\` = 'system-import (pre-RBAC enforcement)'
       WHERE \`performedByUserId\` IS NULL
         AND \`performedByDisplay\` IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE \`decision_review\`
         SET \`performedByDisplay\` = NULL
       WHERE \`performedByUserId\` IS NULL
         AND \`performedByDisplay\` = 'system-import (pre-RBAC enforcement)'`,
    );
  }
}
