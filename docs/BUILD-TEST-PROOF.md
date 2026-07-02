# Sigma PMO — Build & Test Proof (re-runnable)

Mr. Ayham's acceptance report (2026-07-01), priority 3: *"re-run `npm ci && npm run build && npm test`
from a fresh tree and deliver a clear log."* This is that log, and the exact commands to reproduce it.

## How to reproduce (one command chain, from a clean checkout)
```bash
cd backend
npm ci && npm run build && npm test
```
- `npm ci` installs **only** from `package-lock.json` (no drift). The repo is **npm-only** — a `preinstall`
  guard blocks pnpm/yarn (see `RUNBOOK.md` §0). There is no `pnpm-lock.yaml` / `yarn.lock`.
- `npm run build` runs `nest build`.
- `npm test` runs the full Jest suite.

## Result (captured 2026-07-02)
```
Node: v24.15.0   npm: 11.12.1
Method: fresh tree (no node_modules) -> npm ci -> npm run build -> npm test

---- npm ci ----
exit 0   (902 packages, lockfile-only)

---- npm run build (nest build) ----
exit 0

---- npm test (jest) ----
Test Suites: 77 passed, 77 total
Tests:       1 skipped, 1045 passed, 1046 total
Snapshots:   0 total
Time:        ~30 s
```

- **Suites:** 77 passed / 77 total.
- **Tests:** 1045 passed, **1 skipped**, 1046 total. The single skipped test is an Anthropic-live
  integration test that is intentionally skipped when `ANTHROPIC_API_KEY` is not set (deterministic-only
  mode) — it is not a failure.
- **Exit codes:** `npm ci` = 0, `nest build` = 0, `jest` = 0.

## Environment notes
- Production build image is `node:20-alpine` (`backend/Dockerfile`, `npm ci --include=dev` → `nest build`
  → `npm prune --omit=dev`). Reference host above is Node 24 / npm 11; both satisfy `engines`
  (`node >=20`, `npm >=10`).
- `npm audit` reports transitive advisories only (in `exceljs`→`uuid` and dev tooling); none are runtime
  exploitable in this server context and none require a breaking major bump. `npm audit fix` (semver-safe)
  has been applied.

## Frontend
```bash
cd frontend
npm ci && npx tsc --noEmit && npm run build
```
Result (2026-07-02): `tsc --noEmit` exit 0; `next build` compiled successfully, 64/64 static pages
generated (including the new `/journey` and the `/reports/monthly` email action).
