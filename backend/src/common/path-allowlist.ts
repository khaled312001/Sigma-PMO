import { resolve, sep } from 'node:path';

import { ForbiddenException } from '@nestjs/common';

/**
 * Resolve a (possibly relative) user-supplied path and refuse anything that
 * escapes the configured allowlist. Returns the resolved absolute path, or
 * throws `ForbiddenException`. Use for every endpoint that reads files by
 * path supplied through the API.
 */
export function resolveAllowedPath(input: string, allowedRoots: string[]): string {
  const resolved = resolve(input);
  for (const root of allowedRoots) {
    const rootAbs = resolve(root);
    if (resolved === rootAbs || resolved.startsWith(rootAbs + sep)) {
      return resolved;
    }
  }
  throw new ForbiddenException(
    `Path "${input}" is outside the allowed roots. Allowed: ${allowedRoots.join(', ')}`,
  );
}
