# Backup runbook

> Take a daily backup. Verify weekly. See `restore.md` for the recovery drill.

## What's backed up

| Asset                                | Where                                | Method                  |
| ------------------------------------ | ------------------------------------ | ----------------------- |
| Database schema + data               | `sigma_pmo` MySQL                    | `mysqldump`              |
| Source-file archive                  | `STORAGE_DIR` (default `data/storage`) | `rsync` (content-addressed; idempotent) |
| Application config                   | `.env` files (off-host secret store) | Manual                  |
| Application source                   | git remote                           | git push                |

## Daily schedule

`deploy/scripts/backup-cron.sh` is the production cron entry. Default
crontab:

```cron
# Daily DB + storage backup at 02:30, weekly off-host rsync on Sundays.
30 2 * * *  /opt/sigma-pmo/deploy/scripts/backup-cron.sh daily
30 3 * * 0  /opt/sigma-pmo/deploy/scripts/backup-cron.sh weekly
```

The script:

1. Dumps MySQL with `mysqldump --routines --triggers --single-transaction`.
2. Compresses to `/var/backups/sigma-pmo/db-YYYYMMDD.sql.gz`.
3. Rsyncs `STORAGE_DIR` to `/var/backups/sigma-pmo/storage/`.
4. On weekly run, mirrors to the off-host destination (`BACKUP_REMOTE_HOST`).

## Retention policy

| Backup type      | Local retention | Off-host retention |
| ---------------- | --------------- | ------------------ |
| Daily DB dump    | 14 days         | 30 days            |
| Weekly DB dump   | 8 weeks         | 6 months           |
| Source archive   | Forever (immutable; only grows) |

## Encryption at rest

- The on-host backup directory is on an encrypted disk (assumption — verify
  on your Hostinger VPS plan).
- Off-host rsync uses SSH transport; the destination filesystem should also
  be encrypted.
- For extra protection, `gpg --encrypt --recipient backup@sigma-pmo.com` can
  be added to the cron line — Sigma controls the key.

## Sigma proprietary content

`governance_policy.config` rows hold Sigma's proprietary IP. Backups are
encrypted; only Sigma key-holders should be able to decrypt. See
`docs/contract/assumptions/A10-sigma-proprietary-logic.md`.

## Verify the latest backup ran

```bash
ls -lh /var/backups/sigma-pmo/db-*.sql.gz | tail -3
# Should show today's (or yesterday's) dump.
gunzip -t /var/backups/sigma-pmo/db-$(date +%Y%m%d).sql.gz && echo "gzip OK"
```

If the latest backup is older than 24 h, treat as **SEV2** (`incident.md`).
