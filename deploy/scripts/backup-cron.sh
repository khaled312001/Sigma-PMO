#!/usr/bin/env bash
#
# Sigma PMO — daily backup cron
#
# Run by cron under the sigma user once daily. Per docs/runbook/backup.md:
#   - mysqldump of sigma_pmo
#   - tar.gz of /srv/sigma-pmo/storage/files (immutable source archive)
#   - keep 14 daily, 8 weekly, 6 monthly
#   - rsync off-host (configured via SIGMA_OFFSITE_RSYNC env var)
#
# Crontab line:
#   15 2 * * * /srv/sigma-pmo/deploy/scripts/backup-cron.sh >> /srv/sigma-pmo/storage/backups/cron.log 2>&1

set -euo pipefail

# Env from a file rather than crontab so secrets don't end up in `crontab -l`
if [[ -f /etc/sigma-pmo/backup.env ]]; then
  set -a
  # shellcheck disable=SC1091
  . /etc/sigma-pmo/backup.env
  set +a
fi

ROOT=/srv/sigma-pmo
BACKUPS="$ROOT/storage/backups"
TODAY=$(date -u +%Y-%m-%d)
WEEKDAY=$(date -u +%u)        # 1..7
DAY_OF_MONTH=$(date -u +%d)

mkdir -p "$BACKUPS/daily" "$BACKUPS/weekly" "$BACKUPS/monthly"

DB_USER="${SIGMA_DB_USER:-sigma_pmo}"
DB_NAME="${SIGMA_DB_NAME:-sigma_pmo}"
DB_PASS="${SIGMA_DB_PASS:?SIGMA_DB_PASS must be set in /etc/sigma-pmo/backup.env}"

echo "[$(date -u --iso-8601=seconds)] backup begin"

# --- DB dump ----------------------------------------------------------------
DUMP="$BACKUPS/daily/db-$TODAY.sql.gz"
MYSQL_PWD="$DB_PASS" mysqldump \
  --user="$DB_USER" \
  --single-transaction --routines --triggers --events \
  --default-character-set=utf8mb4 \
  "$DB_NAME" | gzip -9 > "$DUMP"
echo "    db dump → $DUMP ($(stat -c %s "$DUMP") bytes)"

# --- storage tar ------------------------------------------------------------
TAR="$BACKUPS/daily/files-$TODAY.tar.gz"
tar -C "$ROOT/storage" -czf "$TAR" files
echo "    files tar → $TAR ($(stat -c %s "$TAR") bytes)"

# --- weekly + monthly copies (cheap hardlinks) -----------------------------
if [[ "$WEEKDAY" == "7" ]]; then
  cp -al "$DUMP" "$BACKUPS/weekly/db-$TODAY.sql.gz"
  cp -al "$TAR"  "$BACKUPS/weekly/files-$TODAY.tar.gz"
  echo "    weekly copies created"
fi
if [[ "$DAY_OF_MONTH" == "01" ]]; then
  cp -al "$DUMP" "$BACKUPS/monthly/db-$TODAY.sql.gz"
  cp -al "$TAR"  "$BACKUPS/monthly/files-$TODAY.tar.gz"
  echo "    monthly copies created"
fi

# --- retention --------------------------------------------------------------
find "$BACKUPS/daily"   -type f -mtime +14 -delete
find "$BACKUPS/weekly"  -type f -mtime +60 -delete
find "$BACKUPS/monthly" -type f -mtime +185 -delete

# --- off-host rsync (best-effort, never fails the cron) --------------------
if [[ -n "${SIGMA_OFFSITE_RSYNC:-}" ]]; then
  rsync -a --delete \
    --rsync-path='ionice -c2 -n7 nice -n10 rsync' \
    "$BACKUPS/" "$SIGMA_OFFSITE_RSYNC/" \
    || echo "    WARN: off-host rsync failed (continuing)"
fi

echo "[$(date -u --iso-8601=seconds)] backup end"
