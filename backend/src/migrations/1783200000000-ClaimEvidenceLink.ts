import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Forensic evidence chain (Mr. Ayham acceptance 2026-06-28): the
 * `claim_evidence_link` register — one row per cited piece of evidence on a
 * claim's forensic chain (letter / daily report / baseline / update / photo /
 * video / BOQ line / FIDIC clause / alert / decision / evidence item), each
 * source-ref'd back to the exact file / page / paragraph / sha256. Additive only.
 */
export class ClaimEvidenceLink1783200000000 implements MigrationInterface {
  name = 'ClaimEvidenceLink1783200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.getTable('claim_evidence_link');
    if (exists) return;
    await queryRunner.query(
      'CREATE TABLE `claim_evidence_link` (' +
        '`id` varchar(36) NOT NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`companyId` char(36) NULL, `claimId` char(36) NOT NULL, `linkType` varchar(24) NOT NULL, ' +
        '`targetTable` varchar(64) NOT NULL, `targetId` varchar(128) NOT NULL, `sourceRef` json NULL, ' +
        '`note` varchar(512) NULL, `createdBy` varchar(128) NULL, ' +
        'INDEX `IDX_claim_evidence_companyId` (`companyId`), ' +
        'INDEX `IDX_claim_evidence_claimId` (`claimId`), ' +
        'INDEX `IDX_claim_evidence_claim_type` (`claimId`, `linkType`), ' +
        'PRIMARY KEY (`id`)' +
        ') ENGINE=InnoDB',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `claim_evidence_link`');
  }
}
