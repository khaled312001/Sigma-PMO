# Database backups → S3 + restore

The Sigma PMO database (MySQL) is an OLTP store; it can't run *on* S3 directly. Durability is achieved
with **automated encrypted backups to S3** (object storage) plus the **file archive on S3**. This is the
"database on S3" architecture for this stack.

## What runs
- `scripts/backup-db-to-s3.ts` — `mysqldump → gzip → (AES-256-GCM encrypt) → S3 db-backups/<db>-<ts>.sql.gz[.enc]`,
  then prunes beyond `BACKUP_RETENTION` (default 14).
- `scripts/restore-db-from-s3.ts` — downloads a backup, decrypts + gunzips, and pipes it into `mysql`
  (DESTRUCTIVE — requires `--yes`). Can restore into a scratch DB with `--into` for verification.

## One-time setup
1. Set S3 creds in `.env`: `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` (+ `S3_ENDPOINT` /
   `S3_FORCE_PATH_STYLE` for non-AWS providers).
2. Generate + set the backup key (kept OUT of the bucket, in your secrets manager):
   ```
   openssl rand -hex 32        # → BACKUP_ENCRYPTION_KEY
   ```
3. (AWS only, optional) `S3_SSE=AES256` for server-side at-rest encryption as well.
4. Enable the S3 file archive for uploads/PDFs (same `S3_*` envs drive `StorageService`).

## Backup
```
cd backend && npx ts-node scripts/backup-db-to-s3.ts
```

## Schedule (nightly)
**Linux/macOS (cron) — 02:30 daily:**
```
30 2 * * * cd /srv/sigma/backend && /usr/bin/npx ts-node scripts/backup-db-to-s3.ts >> /var/log/sigma-backup.log 2>&1
```
**Windows (Task Scheduler):**
```
schtasks /Create /SC DAILY /ST 02:30 /TN "SigmaDbBackup" /TR "cmd /c cd /d E:\Sigma PMO\backend && npx ts-node scripts/backup-db-to-s3.ts"
```

## Restore
```
# list backups
npx ts-node scripts/restore-db-from-s3.ts --list
# restore the latest into DB_DATABASE (DESTRUCTIVE)
npx ts-node scripts/restore-db-from-s3.ts --latest --yes
# restore a specific object
npx ts-node scripts/restore-db-from-s3.ts --key db-backups/sigma_pmo-2026-...sql.gz.enc --yes
```

## Monthly restore drill (verify backups actually work)
Restore the latest backup into a throwaway database and sanity-check row counts — never trust an
un-tested backup:
```
mysql -u root -e "CREATE DATABASE IF NOT EXISTS sigma_restore_check"
npx ts-node scripts/restore-db-from-s3.ts --latest --into sigma_restore_check --yes
mysql -u root sigma_restore_check -e "SELECT COUNT(*) FROM company; SELECT COUNT(*) FROM project;"
mysql -u root -e "DROP DATABASE sigma_restore_check"
```

## Notes
- The backup contains **all tenants' data** — treat `BACKUP_ENCRYPTION_KEY` like a production secret;
  losing it makes `.enc` backups unrecoverable.
- For near-zero-RPO recovery, add MySQL binlog shipping to S3 (point-in-time recovery) as a later step.
- Prefer a managed MySQL (RDS/Aurora/Cloud SQL) in production; these add native automated snapshots
  (themselves stored on S3) on top of these logical dumps.
