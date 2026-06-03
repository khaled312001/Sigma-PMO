# Incident response runbook

> Use this when something is broken. See `monitoring.md` for the probes that
> wake you up; `ops.md` for routine maintenance; `backup.md` + `restore.md`
> for data recovery.

## Severity ladder

| Severity | Definition                                       | Initial response                          |
| -------- | ------------------------------------------------ | ----------------------------------------- |
| **SEV1** | Platform unavailable to all stakeholders         | Page the on-call. 15-min SLA.             |
| **SEV2** | Major feature unavailable (e.g., ingestion down) | Mention on-call. 1-h SLA.                 |
| **SEV3** | Single role / single project affected            | Open a ticket. 4-h SLA in business hours. |
| **SEV4** | Cosmetic / documentation                         | Backlog.                                  |

## First five minutes (any severity)

1. **Confirm scope.** Curl `/api/v1/live` (the process up?) and `/api/v1/ready`
   (DB up?). If one is green and one is red, you have a partial outage.
2. **Capture correlation IDs.** Reproduce the failing request; copy the
   `x-request-id` from the response. Every log line in pino is bound to it.
3. **Grab the log slice.**
   ```bash
   journalctl -u sigma-pmo-backend --since "10m ago" | jq -c 'select(.reqId == "<id>")'
   ```
4. **Check Sentry** if `SENTRY_DSN` is set — the latest unhandled error and
   stack trace will be there.

## Known rollback path

The safe roll-back is to a previously tagged release:

```bash
cd /opt/sigma-pmo
git fetch --tags
git checkout v1.0.0-acceptance   # or any other tagged release
deploy/scripts/deploy.sh
```

If a migration was the cause of the incident, see `restore.md` § "Restoring
across a failed migration". Never run `npm run migration:revert` against
production without a backup taken first (see `backup.md`).

## Common symptoms → first action

| Symptom                                            | First action                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `/ready` returns 503 with `db: down`                | Check DB process is up; check network reachability on port 3306    |
| HTTP 401 on previously-working API calls            | API key rotated? Check `/api/v1/auth/me` with the supplied key      |
| HTTP 429 spikes                                     | Rate limit triggered. Inspect `RATE_LIMIT_*` env; consider raising  |
| HTTP 503 on auth endpoints (bootstrap)              | All users deleted? Use `BOOTSTRAP_TOKEN` to create a new admin      |
| Ingestion endpoint returns 422 with validation list | Source file fails structural validation; inspect `validation` field |
| Frontend serves but reports CORS errors             | `CORS_ORIGINS` env doesn't include the frontend origin              |
| Memory growth on backend                            | Inspect a recent over-large upload; the 25 MB body limit applies     |

## Post-incident

1. Write a short incident note: scope, root cause, mitigation, time-to-detect,
   time-to-resolve. Attach the relevant request-ids.
2. If the root cause was a code defect, open a follow-up PR and tag the
   fix to a future ADR if architectural.
3. If the root cause was a missing alert / monitoring gap, update
   `monitoring.md`.
