#!/usr/bin/env bash
#
# Create a clean release archive for manual upload when git clone is not used.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="/tmp/sigma-pmo-release-$STAMP.tar.gz"

cd "$ROOT"

tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='*/node_modules' \
  --exclude='dist' \
  --exclude='*/dist' \
  --exclude='.next' \
  --exclude='*/.next' \
  --exclude='coverage' \
  --exclude='data/storage' \
  --exclude='.env' \
  --exclude='*.env' \
  -czf "$OUT" .

echo "$OUT"
