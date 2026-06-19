# Time & Timezones — UTC is the single source of truth

Sigma serves clients worldwide; the server is operated from Egypt. The standard
(global best practice) is: **store UTC, display local.** UTC is king; conversion
happens on the client.

## What the platform already does

- **Database stores UTC.** The MySQL connection uses `timezone: 'Z'`
  (`backend/src/database/database.module.ts`, `backend/data-source.ts`), so every
  `datetime` is written and read as UTC regardless of the server's local zone.
- **API returns ISO 8601 with `Z`.** A JavaScript `Date` serialises to JSON as
  `2026-06-18T14:00:00.000Z` automatically — every timestamp the API emits is
  unambiguous UTC.
- **The process runs in UTC.** `TZ=UTC` is set in both Dockerfiles and as a guard
  in `main.ts`, so logs and `new Date()` are UTC too.
- **The frontend displays local.** The UI formats with `toLocaleString()` /
  `toLocaleDateString()`, which read the **viewer's device timezone** and convert
  the UTC value on screen — Dubai, New York and Tokyo each see their own local
  time from the same stored value.

## Roles

**System Administrator (server).** Keep the server, Docker, MySQL and every
Coolify container on **UTC**. When reading logs, mentally offset to local
(Egypt = UTC+3 in summer / UTC+2 in winter). Dashboards (Grafana, Coolify) can
show your local time while the underlying log stays UTC.

**Developer (code).** Persist every event (account creation, payment, upload) in
**UTC, ISO 8601, ending in `Z`**. Never store local time. The client
(JavaScript/React/Flutter) reads the device timezone and converts on display.

## Worked example

A client in the UAE buys at **8:00 PM Dubai** → the server stores **4:00 PM UTC**
→ in the logs (Egypt) you read it as **7:00 PM Cairo** → a viewer in Japan sees
**1:00 AM Tokyo**. One stored value, correct everywhere — no clashes in schedules
or financial reports.
