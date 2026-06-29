/**
 * Package-manager guard (Sigma PMO).
 *
 * This project is locked to a SINGLE package manager: **npm** (one lockfile:
 * package-lock.json). Installing with pnpm or yarn produces a different
 * dependency tree, a second lockfile, and the "works on my machine" drift that
 * broke a clean build during handover review (2026-06-29). This preinstall hook
 * stops that at the source with a clear message.
 *
 * Design: fail ONLY when the caller is unambiguously pnpm or yarn. If the user
 * agent is missing/unknown (some CI sandboxes, Docker layers), we ALLOW the
 * install — the guard must never break a legitimate `npm ci`. Escape hatch:
 * set SIGMA_ALLOW_ANY_PM=1 to bypass entirely.
 */
'use strict';

if (process.env.SIGMA_ALLOW_ANY_PM === '1') process.exit(0);

const ua = (process.env.npm_config_user_agent || '').toLowerCase();

// Only block the two managers we explicitly do not support. Unknown → allow.
const blocked = ua.startsWith('pnpm/') || ua.includes(' pnpm/') || ua.startsWith('yarn/') || ua.includes(' yarn/');

if (blocked) {
  const mgr = ua.includes('pnpm') ? 'pnpm' : 'yarn';
  const line = '═'.repeat(64);
  process.stderr.write(
    `\n${line}\n` +
      `  ✖  Sigma PMO is locked to npm. You are using "${mgr}".\n` +
      `     Sigma PMO مقفولة على npm فقط — لا تستخدم pnpm أو yarn.\n\n` +
      `  There is ONE lockfile (package-lock.json). Run exactly:\n\n` +
      `      npm ci          # clean, lockfile-only install\n` +
      `      npm run build\n` +
      `      npm test\n\n` +
      `  Why: ${mgr} resolves a different dependency tree and writes a second\n` +
      `  lockfile, which is the drift that breaks a clean build. See RUNBOOK.md.\n` +
      `  (CI override, only if you know why: SIGMA_ALLOW_ANY_PM=1)\n` +
      `${line}\n\n`,
  );
  process.exit(1);
}

process.exit(0);
