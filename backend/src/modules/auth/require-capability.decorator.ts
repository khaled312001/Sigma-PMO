import { SetMetadata } from '@nestjs/common';

import { Capability, REQUIRED_CAPABILITY } from './api-key.guard';

/** Marks a route as requiring a specific capability (see roles.enum). */
export const RequiresCapability = (capability: Capability) =>
  SetMetadata(REQUIRED_CAPABILITY, capability);
