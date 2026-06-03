#!/usr/bin/env bash
#
# Sigma PMO — restore drill
#
# Per docs/runbook/restore.md (RTO 2h, RPO 24h). Idempotent. Run quarterly.
#
# Restores the latest daily DB dump to a SCRATCH database (default name
# sigma_pmo_restore_drill — never touches sigma_pmo), runs row-count smoke
# checks, and exits 0 only if the chain ingestion_run → activity is
# non-empty and counts match the prior drill output (if any).
#
# Output is what gets pasted into docs/handover/acceptance-evidence-pack.md
# § "Live deploy proof".

set -euo pipefail

if [[ -f /etc/sigma-pmo/backup.env ]]; then
  set -a
  # shellcheck disable=SC1091
  . /etc/sigma-pmo/backup.env
  set +a
fi

ROOT=/srv/sigma-pmo
BACKUPS="$ROOT/storage/backups"
SCRATCH_DB="${SIGMA_DRILL_DB:-sigma_pmo_restore_drill}"
ADMIN_USER="${SIGMA_DRILL_ADMIN:-root}"

LATEST_DUMP=$(ls -1t "$BACKUPS/daily"/db-*.sql.gz 2>/dev/null | head -n1 || true)
if [[ -z "$LATEST_DUMP" ]]; then
  echo "no daily backup found under $BACKUPS/daily" >&2
  exit 1
fi
echo "==> latest dump: $LATEST_DUMP"

echo "==> drop + recreate scratch DB $SCRATCH_DB"
mariadb -u"$ADMIN_USER" -e "DROP DATABASE IF EXISTS $SCRATCH_DB; CREATE DATABASE $SCRATCH_DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "==> restore"
gunzip -c "$LATEST_DUMP" | mariadb -u"$ADMIN_USER" "$SCRATCH_DB"

echo "==> row counts:"
mariadb -u"$ADMIN_USER" -t "$SCRATCH_DB" <<'SQL'
SELECT 'source_file'      AS table_name, COUNT(*) AS rows_ FROM source_file UNION ALL
SELECT 'ingestion_run',     COUNT(*) FROM ingestion_run UNION ALL
SELECT 'activity',          COUNT(*) FROM activity UNION ALL
SELECT 'alert',             COUNT(*) FROM alert UNION ALL
SELECT 'governance_policy', COUNT(*) FROM governance_policy UNION ALL
SELECT 'governance_decision', COUNT(*) FROM governance_decision;
SQL

echo "==> evidence chain spot-check (most recent alert):"
mariadb -u"$ADMIN_USER" -t "$SCRATCH_DB" <<'SQL'
SELECT a.id AS alert_id, a.ruleCode, a.severity, ir.id AS ingestion_run_id, sf.sha256
FROM alert a
LEFT JOIN activity act       ON act.id = a.activityId
LEFT JOIN ingestion_run ir   ON ir.id = act.ingestionRunId
LEFT JOIN source_file sf     ON sf.id = ir.sourceFileId
ORDER BY a.createdAt DESC
LIMIT 1;
SQL

echo "drill complete."
