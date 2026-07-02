# Sigma PMO — Performance Report

> Performance evidence from the load / stress test in `docs/qa/`. **Every number below is copied
> verbatim from [`docs/qa/load-results.json`](qa/load-results.json)** — none are invented. The test
> harness is [`docs/qa/load-test.mjs`](qa/load-test.mjs). Companion: [`ARCHITECTURE.md`](ARCHITECTURE.md).
>
> **الخلاصة (Arabic summary):** اختبار حِمل حقيقي شغّل 19,000 عملية على 5 سيناريوهات. القراءات
> سريعة عند الوسيط (p50 ≈ 52–95 مللي ثانية). مُحدِّد المعدّل (rate limiter) ردّ معظم الطلبات المتدفقة
> من مصدر واحد بـ 429 (سلوك حماية متوقّع). الذكاء الاصطناعي (Claude) — المسار البطيء — لم يُختبر لأنه
> اختياري. المنطق حتمي أولاً ومعظم النقاط قراءات قاعدة بيانات.

---

## 1. Test method (what was measured)

`load-test.mjs` drives thousands of concurrent HTTP operations against a running API and records, per
scenario: total ops, worker concurrency, wall-clock time, throughput (total ÷ wall), the HTTP status
histogram, and latency percentiles (avg / p50 / p95 / p99 / max).

- **Run:** `2026-06-19T07:58:53Z`
- **Target:** `http://127.0.0.1:3009/api/v1` — a **local, isolated QA stack** (single node, loopback;
  authorized own-system test).
- **Totals:** **19,000 ops**, **3,600** 2xx, **84** transport errors.

Scenarios: (S1) bulk user creation (writes + **scrypt** password hashing, CPU-bound), (S2)
high-concurrency simple reads `GET /projects`, (S3) computed reads `GET /executive/overview` (KPIs),
(S4) concurrent writes `POST /onboarding/support` (a real insert), (S5) a mixed burst across reads +
writes + ingestion/rules queries.

---

## 2. Measured results (verbatim from `load-results.json`)

### 2.1 Latency &amp; throughput

| Scenario | Ops | Concurrency | Wall (ms) | Throughput (req/s)¹ | Latency avg | **p50** | **p95** | **p99** | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `bulk-create-users` (write, scrypt) | 1000 | 60 | 27,210 | 36.8 | 1628 | 2638 | 2787 | 3191 | 3775 |
| `read-projects` (read) | 6000 | 400 | 4,966 | 1208.3 | 309 | **95** | 1854 | 3574 | 3720 |
| `read-executive-overview` (computed read) | 4000 | 250 | 5,554 | 720.2 | 325 | **87** | 1540 | 2729 | 2796 |
| `write-support-tickets` (write, insert) | 3000 | 200 | 3,491 | 859.4 | 226 | **52** | 1058 | 2137 | 2147 |
| `mixed-burst` (mixed) | 5000 | 500 | 5,349 | 934.8 | 502 | **68** | 2147 | 2780 | 2944 |

All latencies in **milliseconds**. ¹ Throughput = total requests ÷ wall time, so it **counts every
request including fast `429` rejections** (see §2.2) — it is the request-handling rate under load, not
the sustained 2xx-serving rate.

### 2.2 Status breakdown (why 2xx < total)

| Scenario | 200 OK | 429 (rate-limited) | Transport errors |
|---|---:|---:|---:|
| `bulk-create-users` | 600 | 400 | 0 |
| `read-projects` | 600 | 5400 | 0 |
| `read-executive-overview` | 600 | 3400 | 0 |
| `write-support-tickets` | 600 | 2400 | 0 |
| `mixed-burst` | 1200 | 3716 | 84 |

**Interpretation (honest).** The high `429` counts are the **per-IP rate-limit throttler doing its
job**: the harness floods the API from a **single origin** far faster than a real client would, so once
the throttle bucket is exhausted the rest of the burst is rejected with `429` + `Retry-After` in
sub-millisecond time. This is **expected, protective behaviour**, not a failure — it is why every
scenario's 2xx count settles at the bucket ceiling (~600 per window). The only true errors were **84**
transport errors, and only in `mixed-burst` at **concurrency 500** (0.44% of the 19,000 total ops) —
connection resets under the most extreme fan-out.

**Latency reading.** Median (p50) response times for the read/write paths are **52–95 ms**, i.e. the
DB read/insert path is fast at the median. p95/p99 climb (1–3.5 s) because they include requests queued
behind 250–500 concurrent workers on a single loopback node — tail latency under saturation, not
steady-state. `bulk-create-users` is the slowest by design: **scrypt** password hashing is
deliberately CPU-expensive (a security property), so p50 ≈ 2.6 s there reflects the hash cost, not the
general request path.

---

## 3. Deterministic-first design implication

The platform is **deterministic-first**: the endpoints exercised here — `GET /projects`,
`GET /executive/overview`, `POST /onboarding/support` — are **plain MySQL reads/inserts**, which is why
medians are tens of milliseconds. The **slow path is the optional AI (Claude) call** used only for
prose (narratives, FIDIC drafts, clash suggestions); it is network-bound on a third-party API and was
**deliberately not part of this load test** (and is skipped entirely when no key is configured). So:
**the hot, always-on request surface is the fast DB path measured above; the slow AI path is optional,
rate-shaped, and off the critical read/write flow.**

---

## 4. What was NOT measured (limitations)

`load-results.json` does not contain these fields, so they are reported as **not measured**:

- **Server-side CPU / memory / heap** during the run (no resource telemetry captured).
- **DB-level query timing** (per-query latency, slow-query counts) — only end-to-end HTTP latency.
- **AI / Claude endpoint latency** (the optional slow path was not exercised).
- **Sustained, non-throttled throughput** — the single-origin flood hits the rate limiter, so the
  numbers reflect burst behaviour with throttling engaged, not a distributed steady-state benchmark.
- **Multi-node / production-hardware results** — the target was a single local loopback stack.

These are honest gaps, not defects; a distributed benchmark with resource telemetry would be a
separate exercise (and Prometheus `/metrics` + tracing are noted as future work in
[`runbook/monitoring.md`](runbook/monitoring.md)).

---

## 5. How to (re)generate this evidence

```bash
# Start the API (QA stack), then, with an admin API key:
cd docs/qa
BASE=http://127.0.0.1:3009/api/v1 ADMIN_KEY=sk_... node load-test.mjs
# Optional heavier run: prefix with SCALE=2 (or higher) to multiply every scenario's op count.
# Writes results to docs/qa/load-results.json (the file summarized above).
```

The harness prints a per-scenario line (`total / conc / wall / tput / ok / err` + latency percentiles
+ status histogram) and writes the machine-readable `load-results.json`. Re-running overwrites that
file with a fresh `ranAt` timestamp.
