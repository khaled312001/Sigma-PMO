import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { SeedService } from './seed.service';

/**
 * First-boot demo seeder (gated by SEED_DEMO=true). Imports CanonicalModule for
 * the Company/User repositories and AuthModule for the password hasher, so
 * seeded credentials verify identically to a normal login.
 */
@Module({
  imports: [CanonicalModule, AuthModule],
  providers: [SeedService],
})
export class SeedModule {}
