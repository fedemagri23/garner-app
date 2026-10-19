# Performance

How Garner behaves under a city-sized load, how to measure it again, and what
the measurements found. Recorded on 2026-10-19; re-run before trusting these
numbers on different code or hardware.

## Running it

```bash
docker compose up -d --wait
pnpm run build
pnpm run load:prepare            # fresh *_load databases + seed (~40 s)

pnpm run load:jobs               # background work, API stopped (~20 min)

pnpm run load:api                # the API on :3100, production mode
pnpm run load:http               # k6 mixed workload, 2 minutes
ONLY=browse DURATION=1m pnpm run load:http   # one scenario on its own
RATE_SCALE=2 pnpm run load:http              # twice the traffic
```

Everything runs against its own databases (`*_db_load`) and Redis database 2,
configured in `load/load.env`, so development and test data are never touched.

**Before an HTTP run, let the API go quiet.** On a fresh Redis the daily
aggregation runs as soon as its scheduler is created (CON-041) — seven
minutes of heavy writes that will dominate whatever you measure alongside it.
Wait until `GET /v1/health` shows no active `price-intelligence` jobs.

**Check your disk.** `load:prepare` turns off `synchronous_commit` on the load
databases. The reference laptop's Docker volume manages about four fsyncs a
second (`pg_test_fsync` reported 268 ms per `fdatasync`), which made every
write endpoint wait a quarter of a second per commit — a property of the
laptop, not of the system. A server disk fsyncs in well under 2 ms.

## The dataset

`load/seed.mjs`, sized by environment variables:

| | Default |
| --- | --- |
| Products | 3,000 |
| Chains × stores | 3 × 20 = 60 stores |
| Priced product/store pairs | ~90,000 (50% coverage) |
| Daily history | 30 days → ~2.7 million rows |
| Raw observations | ~99,000 (one confirmed feed observation per pair, plus shopper reports) |
| Shoppers | 300, each with a 12-item list |
| Feeds | one per chain, ~30,000 prices each, one price in ten moved since yesterday |

## Reference machine

Intel Core i5-8279U (4 cores, 8 threads), 14 GB RAM, Linux 7.0. Node 22.22,
PostgreSQL 16.15 and Redis 7 in Docker, k6 0.54 — **all on the same machine**
as the API, competing for the same four cores.

## Background work

`pnpm run load:jobs`, one process, nothing else running.

| Work | Volume | Time | Rate |
| --- | --- | --- | --- |
| Daily import, per feed | ~30,000 prices (27,000 unchanged) | **51–52 s** | 1.72 ms/price |
| Recomputes those imports queue | 70,448 jobs | 416 s | 170 jobs/s |
| Daily aggregation | 89,892 pairs | 447 s | 4.98 ms/pair |

The import was **307 s (10.2 ms/price)** before unchanged prices were
confirmed in bulk (CON-039). At the per-price rate, a 10,000-product,
50-store chain would have taken about 85 minutes a day; it now takes about 15.

What scales linearly and will need attention at real volume (CON-040):
aggregation at ~5 ms a pair is ~40 minutes a day for 500,000 pairs, and every
confirmation queues a recompute.

## HTTP

`pnpm run load:http`, 2 minutes at fixed arrival rates — 30 browse
iterations a second (search, compare near a location, 30-day history), 4 price
reports a second and 1 list optimization a second, all at once. About
**90 requests a second**.

| Endpoint | Median | p90 | p95 | Max |
| --- | --- | --- | --- | --- |
| `GET /v1/products?search=` | 7.6 ms | 224 ms | 402 ms | 930 ms |
| `GET /v1/products/:id/prices` (near a location) | 7.1 ms | 238 ms | 324 ms | 890 ms |
| `GET /v1/products/:id/prices/history` | 13.4 ms | 153 ms | 191 ms | 708 ms |
| `POST /v1/price-observations` | 18.1 ms | 444 ms | 638 ms | 849 ms |
| `POST /v1/shopping-lists/:id/optimize` | 17.8 ms | 729 ms | 753 ms | 798 ms |
| Optimization, request to completed answer | 285 ms | 1.14 s | 1.21 s | 1.64 s |

No server errors. The 0.4% of failed requests in the recorded run were 429s
from the per-account report limit, from shoppers reused across repeated runs
within the hour — the protection working as designed.

**Medians are low; tails are not.** Traces of the slow requests (exported with
`OTEL_EXPORTER_OTLP_ENDPOINT`) show the time spent waiting: for a pooled
database connection, and in queries that take 50–250 ms instead of 5 because
Postgres is competing for the same four cores. The API process itself is
60–65% busy at this load. A CPU profile shows no single hotspot — Prisma's
in-process query compiler is the largest slice at ~13%. Raising the pool from
10 to 25 connections did not change the tail. This is what one process doing
HTTP and every worker, next to its database and its load generator, looks like
(CON-040).

The k6 thresholds are a regression gate set about 1.5× above this run, not a
service level objective.

## Defects the load test found

- **BUG-015** — "import now" during the scheduled import ran the same slot
  twice. Fixed with a heartbeat lease on runs.
- **BUG-016** — queues ignored the database index in `REDIS_URL`, so
  deployments sharing a Redis consumed each other's jobs. Fixed.
- The per-price import path was too slow for a real catalog. Fixed by bulk
  confirmation (CON-039).
