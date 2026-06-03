#!/usr/bin/env bash
#
# Sigma PMO — deploy
#
# Pulls latest main, installs deps, builds both apps, runs migrations,
# restarts services, and checks /api/v1/ready.
#
# Run as the deploy user (sigma) or via sudo -u sigma.
#
# Idempotent: safe to re-run. Atomic where possible (build before restart).

set -euo pipefail

ROOT=/srv/sigma-pmo
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
GIT_REF="${SIGMA_GIT_REF:-main}"

echo "==> [1/6] git fetch + checkout $GIT_REF"
cd "$ROOT"
if [[ ! -d .git ]]; then
  echo "   $ROOT is not a git checkout — clone the repo here first." >&2
  exit 1
fi
git fetch --tags origin
git checkout "$GIT_REF"
git pull --ff-only origin "$GIT_REF" || true

echo "==> [2/6] backend: npm ci + build"
cd "$BACKEND"
npm ci --omit=optional
npm run build

echo "==> [3/6] frontend: npm ci + build"
cd "$FRONTEND"
npm ci --omit=optional
npm run build

echo "==> [4/6] backend: run migrations"
cd "$BACKEND"
npm run migration:run

echo "==> [5/6] restart services"
# systemctl needs sudo. Operators usually run this script via sudo, or
# grant sigma user the two restart commands via /etc/sudoers.d/sigma-pmo.
sudo systemctl restart sigma-pmo-backend.service
sudo systemctl restart sigma-pmo-frontend.service

echo "==> [6/6] health check"
sleep 3
status=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/v1/ready || true)
if [[ "$status" != "200" ]]; then
  echo "   /api/v1/ready returned $status — check journalctl -u sigma-pmo-backend" >&2
  exit 1
fi
echo "   /api/v1/ready: 200 OK"
echo "deploy complete."
