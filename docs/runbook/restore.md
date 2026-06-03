# Restore runbook

> Drill this **quarterly** at a minimum. Untested backups are not backups.

## RTO / RPO statement

- **RPO (Recovery Point Objective): 24 hours.** Daily backup cadence.
- **RTO (Recovery Time Objective): 2 hours.** From "the platform is down" to
  "the platform is up against the restored DB."

## Drill (run on a scratch DB; do not touch production)

The drill script `deploy/scripts/restore-drill.sh` does this end-to-end and
exits non-zero on any check failure.

```bash
#!/usr/bin/env bash
# (Excerpt from deploy/scripts/restore-drill.sh)
DRILL_DB=sigma_pmo_drill
LATEST=$(ls -t /var/backups/sigma-pmo/db-*.sql.gz | head -1)

mysql -u root <<EOF
DROP DATABASE IF EXISTS $DRILL_DB;
CREATE DATABASE $DRILL_DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EOF

gunzip -c "$LATEST" | mysql -u root "$DRILL_DB"

# Smoke check: at least one row in every key table.
mysql -u root "$DRILL_DB" -e "SELECT
    (SELECT COUNT(*) FROM project)            AS projects,
    (SELECT COUNT(*) FROM activity)            AS activities,
    (SELECT COUNT(*) FROM ingestion_run)       AS runs,
    (SELECT COUNT(*) FROM governance_policy)   AS policies;"
```

After the drill: drop `sigma_pmo_drill` to release the disk.

## Production restore from full DB loss

1. **Stop the API.** `systemctl stop sigma-pmo-backend`.
2. **Provision the DB.** Same `sigma_pmo` database + user (see `ops.md`
   § "First-time setup").
3. **Restore the latest dump.**
   ```bash
   gunzip -c /var/backups/sigma-pmo/db-$(date +%Y%m%d -d "1 day ago").sql.gz \
     | mysql -u sigma -p sigma_pmo
   ```
4. **Restore the storage archive.**
   ```bash
   rsync -av /var/backups/sigma-pmo/storage/ /opt/sigma-pmo/data/storage/
   ```
5. **Start the API.** `systemctl start sigma-pmo-backend`.
6. **Health-check.** `curl /api/v1/ready` returns 200 with `db: up`.
7. **Spot-check.** Pick a recent alert from the UI, click into Evidence,
   confirm the source file is reachable on disk and the SHA-256 matches.

## Restoring across a failed migration

A failed migration can be in three states:

| State                                                   | Action                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| Migration didn't start (DB unchanged)                   | `git checkout <previous tag>`; redeploy.                              |
| Migration partially applied                             | Restore DB from backup, then redeploy at the previous tag.            |
| Migration ran to completion but breaks the app           | Either fix-forward (write a fixup migration) or restore from backup.   |

**Default to restore-from-backup** unless the fix is genuinely one-line and
clearly safe. Migration failures are SEV2 by default.
