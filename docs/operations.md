# Operations

Running Garner: what to watch, what to do when something breaks, and how to
get the data back.

## Deployment shape

One API process serving HTTP and running the BullMQ workers in-process, over
PostgreSQL (three logical databases) and Redis. Multiple instances, read
replicas and separate clusters are deliberately **not** part of this design
yet; the architecture makes them possible later without changing the domain.

```
NestJS API + workers
   ├── core_db          identity, catalog, lists, sessions, alerts
   ├── pricing_db       raw observations, sources, imports
   ├── intelligence_db  derived prices, daily history
   └── Redis            cache, rate limits, queues
```

Before running more than one instance, read CON-015 in
[`../journeys/considerations.md`](../journeys/considerations.md): evidence
photos are on local disk and the directory would have to be shared.

## Configuration

Every variable is validated at startup and a bad one crashes the process with
a readable list — see `.env.example` for the full set. The ones that matter
operationally:

| Variable | Why it matters |
| --- | --- |
| `TRUST_PROXY_HOPS` | Number of proxies in front of the API. Wrong, and `req.ip` is the load balancer, so per-IP rate limiting throttles everyone as one client. |
| `LOG_FORMAT` | `json` outside development. Defaults correctly; set it explicitly if a platform captures stdout differently. |
| `MAX_REQUEST_BODY_KB` | Bounds request bodies. Evidence uploads have their own 5 MB limit. |
| `EXTERNAL_SOURCE_TOKENS` | Supermarket credentials, as `{"source-slug":"token"}`. Never in the database. |
| `*_RETENTION_DAYS` | What the maintenance jobs prune, and after how long. |

## Health

| Endpoint | Purpose |
| --- | --- |
| `GET /v1/health` | Readiness. 503 when any dependency is down. Reports `core_db`, `pricing_db`, `intelligence_db`, `redis` and `queues`, plus queue depths. |
| `GET /v1/health/live` | Liveness. Touches nothing, so a database blip never gets healthy instances restarted. |

Point the orchestrator's readiness probe at the first and its liveness probe
at the second. Using readiness for liveness would restart a process that is
merely waiting for Postgres.

## Metrics

`GET /v1/metrics` serves Prometheus text format and requires an **admin**
token — request paths, queue depths and error counts describe the system's
shape and load. It is exempt from rate limiting, since a scraper polls by
design.

| Metric | Watch for |
| --- | --- |
| `garner_http_requests_total{route,method,status}` | 4xx/5xx rates by route |
| `garner_http_request_duration_ms_bucket{route,method}` | Latency; p95 per route |
| `garner_http_server_errors_total` | Any sustained non-zero rate |
| `garner_jobs_total{queue,job,outcome}` | Failure ratio per job |
| `garner_job_failures_total{queue,job,attempt}` | Retry storms — a rising `attempt` label |
| `garner_job_duration_ms_bucket{queue,job}` | Jobs slowing down |
| `garner_queue_waiting{queue}` | Backlog: workers not keeping up |
| `garner_queue_failed{queue}` | Jobs that exhausted their retries |

Counters are in-process and reset when the process restarts, which shows up as
a counter reset — normal, and what `rate()` expects.

## Logs

One JSON object per line, carrying `requestId`, `traceId`, `userId` where
known, and `jobId`/`jobName` inside a worker. A caller may supply
`x-request-id` and `x-trace-id`; both are echoed on the response.

The trace id is the thread to pull: it follows a request into the jobs it
queues, which is how a shopper's report is followed through to the derived
price and the alert it raised. Tracing is deliberately a set of hooks rather
than an OpenTelemetry dependency — see CON-025.

## Scheduled work

All of it is idempotent; running any of it twice changes nothing.

| Job | Queue | Cadence | Does |
| --- | --- | --- | --- |
| `prune-observations` | `pricing-maintenance` | daily | Deletes raw observations past `PRICE_OBSERVATION_RETENTION_DAYS` |
| `aggregate-day` | `price-intelligence` | daily | Compresses yesterday into daily history |
| `recompute-price` | `price-intelligence` | on price events | Rebuilds one derived price |
| `reconcile-sessions` | `contributions` | 10 min | Finds completed trips with no contributions recorded |
| `schedule-source-imports` | `external-imports` | 10 min | Queues due supermarket imports |
| `notification-sweep` | `notifications` | 5 min | Delivers held messages, prunes delivered ones |
| `prune-optimizations` | `optimization` | daily | Deletes finished optimizations past retention |

## Runbooks

### A supermarket import keeps failing

`GET /v1/price-sources` shows `lastStatus` and `consecutiveFailures` per
source; `GET /v1/price-sources/:id/imports` shows each run's error. One source
failing never affects another. Disable it with
`PATCH /v1/price-sources/:id {"isEnabled": false}` while investigating —
nothing else needs to stop.

`PARTIAL` is not a failure: the source answered and some rows could not be
used. Work the queue at `GET /v1/price-sources/:id/products?status=UNMATCHED`.

### A queue is backing up

Check `garner_queue_waiting` and `garner_queue_failed`. Every job is safe to
retry, so failed jobs can be retried from BullMQ. If the backlog is
persistent, the worker is the bottleneck: this is the point at which running
workers as a separate process earns its place.

### Redis is down

The API stays up. Rate limits, submission counters and price caches all fail
open — capacity protection, not authorization (CON-002). Queues stop draining
and jobs accumulate; scheduled work catches up when Redis returns, and the
reconciliation sweeps exist for exactly this.

### Prices look wrong for a product

`GET /v1/products/:id/prices` shows the derived price with its confidence and
observation count. Raw observations behind it are in `pricing_db` with their
status and review reasons. To rebuild one price, enqueue a recompute for that
product and store; to rebuild everything, see below.

## Backup and recovery

Back up **`core_db` and `pricing_db`**. `intelligence_db` is derived.

| Database | Contains | If lost |
| --- | --- | --- |
| `core_db` | Accounts, catalog, stores, lists, trips, alerts | Restore from backup. Nothing recreates it. |
| `pricing_db` | Raw observations, sources, import runs, links | Restore from backup. Losing it loses the inputs to recent prices and every manual product match. |
| `intelligence_db` | Derived prices, daily history | Rebuildable **within the retention window only** — see below. |

Recommended: nightly full dumps of `core_db` and `pricing_db` with
point-in-time recovery, retained at least as long as
`PRICE_OBSERVATION_RETENTION_DAYS` so a restore can still rebuild
intelligence.

### Rebuilding `intelligence_db`

```bash
# 1. Apply the schema.
pnpm run prisma:migrate:deploy

# 2. Recompute current prices for every product/store with recent observations,
#    and re-aggregate each day in the window. Both jobs are idempotent.
#    Enqueue through the price-intelligence queue:
#      recompute-price  { productId, storeId }
#      aggregate-day    { date: "YYYY-MM-DD" }
```

**What cannot be rebuilt:** daily history older than
`PRICE_OBSERVATION_RETENTION_DAYS` (90 by default). Its observations have been
pruned. `daily_price_history` is the long-lived record — back it up or accept
that the window is the horizon (CON-017).

## Production readiness

The plan's criteria, and where each is met:

- [x] **Core journey end to end** — register, find a product, compare prices, build a list, optimize, shop, record prices, contribute, receive alerts. Covered by the e2e suites.
- [x] **Errors observable** — one error shape with a request id, structured logs, error counters per route.
- [x] **Critical jobs retry safely** — every job is idempotent; see the table above.
- [x] **External failures isolated** — one job per source; a failing source cannot stop another.
- [x] **Data ownership enforced** — `assertOwnership` on every user-owned resource, with e2e tests per module.
- [x] **Manipulation protections active** — rate limits, trust evaluation, corroboration before a flagged price counts.
- [x] **History compact** — daily aggregates; raw observations pruned.
- [x] **Redis failure does not corrupt business data** — every Redis path fails open or is a cache.
- [x] **Derived intelligence rebuildable** — within the retention window, as above.
- [x] **Docker deployment reproducible** — `docker compose up -d` plus `pnpm run prisma:migrate:deploy`.

Known gaps are recorded as considerations rather than hidden here: single
instance only (CON-015), no load testing yet (CON-026), tracing hooks without
an exporter (CON-025).
