import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { AuthorityMatrixController } from './authority-matrix.controller';
import { AuthorityMatrixService } from './authority-matrix.service';

/**
 * AuthorityMatrixModule — the Contractual Authority Matrix (Mr. Ayham acceptance
 * #10): the per-project register of authorized representatives and the actions
 * they may take, plus the deterministic authorization check used to flag
 * correspondence/instructions issued by a non-authorized person. Builds on the
 * AuthorityMatrixEntry entity (CanonicalModule).
 */
@Module({
  imports: [CanonicalModule],
  controllers: [AuthorityMatrixController],
  providers: [AuthorityMatrixService],
  exports: [AuthorityMatrixService],
})
export class AuthorityMatrixModule {}
