import { resolve } from 'node:path';

import { ForbiddenException } from '@nestjs/common';

import { resolveAllowedPath } from './path-allowlist';

describe('resolveAllowedPath', () => {
  const tmp = resolve(process.cwd(), 'data/samples');
  const archive = resolve(process.cwd(), 'data/storage');

  it('allows paths inside the allowlist', () => {
    expect(resolveAllowedPath(`${tmp}/p6_schedule.xml`, [tmp, archive])).toBe(
      resolve(tmp, 'p6_schedule.xml'),
    );
  });

  it('allows paths that match the root exactly', () => {
    expect(resolveAllowedPath(tmp, [tmp, archive])).toBe(tmp);
  });

  it('blocks paths that escape via ..', () => {
    expect(() => resolveAllowedPath(`${tmp}/../../../etc/passwd`, [tmp, archive])).toThrow(ForbiddenException);
  });

  it('blocks absolute paths outside the allowlist', () => {
    expect(() => resolveAllowedPath('/etc/passwd', [tmp, archive])).toThrow(ForbiddenException);
  });

  it('blocks sibling paths that share a prefix', () => {
    // e.g., `/data/samples-evil` should not pass because tmp is `/data/samples`.
    expect(() => resolveAllowedPath(`${tmp}-evil/file.xml`, [tmp, archive])).toThrow(ForbiddenException);
  });
});
