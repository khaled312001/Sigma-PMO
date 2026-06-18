# Sigma PMO — Deployment runbook (index)

The full deployment + ops documentation has been split per Clause 8 of the
Service Agreement into focused runbooks under `docs/runbook/`. This file
remains as a redirect index for backward compatibility.

| Concern                  | Document                                           |
| ------------------------ | -------------------------------------------------- |
| Daily operations + env   | [`runbook/ops.md`](runbook/ops.md)                  |
| Incident response        | [`runbook/incident.md`](runbook/incident.md)        |
| Backups (daily / weekly) | [`runbook/backup.md`](runbook/backup.md)            |
| Restore drill            | [`runbook/restore.md`](runbook/restore.md)          |
| Health probes + monitoring | [`runbook/monitoring.md`](runbook/monitoring.md)  |
| Server upload checklist    | [`../deploy/SERVER_UPLOAD_CHECKLIST.md`](../deploy/SERVER_UPLOAD_CHECKLIST.md) |
| Production env templates   | [`../deploy/env/`](../deploy/env/)                |
| Containerized deploy (Docker, alt. to systemd) | [`../docker-compose.yml`](../docker-compose.yml) + backend/frontend `Dockerfile` |
| CI (typecheck + tests)     | [`../.github/workflows/ci.yml`](../.github/workflows/ci.yml) |
| DB backups → S3 (logical, encrypted) | [`BACKUP-RESTORE.md`](BACKUP-RESTORE.md) — complements the rsync backup in `runbook/backup.md` |
| Improvement roadmap        | [`IMPROVEMENT-PLAN.md`](IMPROVEMENT-PLAN.md)       |

The `deploy/` folder at the repo root holds the artefacts the runbooks
reference (nginx config, systemd units, provisioning + deploy + backup +
restore-drill scripts).
