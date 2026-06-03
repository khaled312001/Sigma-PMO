# Monitoring runbook

> Probes, alerts, and the log/metric story for Sigma PMO.

## Health probes

| Endpoint                | Purpose                                                           | Default expectation |
| ----------------------- | ----------------------------------------------------------------- | ------------------- |
| `GET /api/v1/live`      | Process is up — used by container/VM **liveness** probes          | Always 200          |
| `GET /api/v1/ready`     | Process + DB round-trip is OK — used by **readiness** / LB pool   | 200 when healthy; 503 when DB unreachable |
| `GET /api/v1/health`    | Backward-compat alias for `/ready`                                | 200 when healthy    |

**Recommended K8s / Hostinger health config:**

```
livenessProbe:  GET /api/v1/live  · period 10s · threshold 3 failures
readinessProbe: GET /api/v1/ready · period 5s  · threshold 2 failures
```

Liveness must **not** depend on the DB — otherwise a transient DB blip will
kill the pod and lose all in-flight requests. Readiness drains traffic
without killing the pod, which is the right behaviour.

## Structured logs (pino)

Every log line is JSON-encoded in production with `req.id` bound to the
`x-request-id` set by the request-id middleware. Sample line:

```json
{"level":30,"time":1780500000000,"reqId":"6f1e0bd3-…","msg":"POST /api/v1/rules/evaluate → 200"}
```

Aggregation: pipe stdout to your log aggregator of choice. On Hostinger,
`journalctl -u sigma-pmo-backend -o json` is sufficient for ad-hoc queries.

### Useful log queries

```bash
# All errors in the last hour
journalctl -u sigma-pmo-backend --since "1h ago" | jq -c 'select(.level >= 50)'

# Every line for one request-id
journalctl -u sigma-pmo-backend --since "1h ago" | jq -c 'select(.reqId == "<id>")'

# 4xx and 5xx HTTP responses
journalctl -u sigma-pmo-backend --since "1h ago" | \
  jq -c 'select(.msg | test("→ (4|5)[0-9][0-9]"))'
```

## Sentry (optional)

When `SENTRY_DSN` is set, unhandled exceptions and 5xx responses are sent to
Sentry. Recommended alert rules:

| Trigger                           | Severity | Action                       |
| --------------------------------- | -------- | ---------------------------- |
| New unhandled exception (first seen) | warn   | Slack channel #sigma-pmo-ops |
| 5xx error rate > 1% over 5 min       | crit   | Page on-call                 |
| Auth failures > 50/min from one IP   | warn   | Slack channel + auto-block?  |

## Rate-limit observability

The throttler returns 429 with a `Retry-After` header. Spikes are reported
via pino (look for level=warn lines with `→ 429`). High 429 rates from the
ingest bucket usually indicate a misbehaving integration; from the auth
bucket, a credential-stuffing attempt.

## Database metrics

For Hostinger MySQL/MariaDB, the basics:

```bash
mysql -u root -p -e "SHOW GLOBAL STATUS LIKE 'Threads_connected';"
mysql -u root -p -e "SHOW GLOBAL STATUS LIKE 'Slow_queries';"
mysql -u root -p -e "SHOW PROCESSLIST" | head -20
```

Set the slow-query threshold to 0.5 s and review the slow log weekly.

## Future work (not in scope of v1.0.0)

- Prometheus `/metrics` endpoint.
- Tracing via OpenTelemetry.
- Synthetic monitoring (curl `/api/v1/ready` every minute from outside the VPS).

These would be Re-scope Triggers per Annex 2 if Sigma requests them.
