# Garner — Backend

Smart grocery price comparison. A NestJS modular monolith over three logical
PostgreSQL databases, with Redis, BullMQ workers and internal domain events.

The product and architecture specifications live in
[`garner-specs-bussines.md`](garner-specs-bussines.md) and
[`garner-specs-backend.md`](garner-specs-backend.md); the phased delivery plan
is in [`implementation-plan/`](implementation-plan/README.md).

## Requirements

- Node.js 22+
- pnpm
- Docker + Docker Compose

## Getting started

```bash
pnpm install                 # also generates the Prisma clients
cp .env.example .env
docker compose up -d         # PostgreSQL (port 5433) + Redis (6379)
pnpm run prisma:migrate:deploy
pnpm run start:dev
```

The API listens on `http://localhost:3000`. Swagger UI is at `/docs` and the
raw spec at `/docs/openapi.json`.

> Postgres is published on **5433**, not 5432, so it does not collide with a
> PostgreSQL install already running on the host.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm run start:dev` | Run the API with reload |
| `pnpm run build` | Compile to `dist/` |
| `pnpm run typecheck` | Type-check without emitting |
| `pnpm run lint` | oxlint over `src/` and `test/` |
| `pnpm run test` | Unit tests (no infrastructure needed) |
| `pnpm run test:e2e` | Integration tests (needs Docker services up) |
| `pnpm run prisma:generate` | Regenerate all three Prisma clients |
| `pnpm run prisma:migrate` | Create + apply a core_db migration |
| `pnpm run prisma:migrate:pricing` | Create + apply a pricing_db migration |
| `pnpm run prisma:migrate:intelligence` | Create + apply an intelligence_db migration |
| `pnpm run prisma:migrate:deploy` | Apply committed migrations to all three databases |

## Architecture

### Modules

Business modules, each with the same four layers — `domain/` (rules and
entities), `application/` (use cases), `infrastructure/` (Prisma, Redis,
adapters) and `presentation/` (controllers and DTOs):

```
src/
├── common/                  shared infrastructure (config, db, redis, queue, events, http, text)
├── security/                hashing, JWT, guards, rate limiting, ownership
├── auth/                    registration, login, refresh-token rotation
├── users/                   accounts, profile, location and interest preferences
├── products/                canonical catalog: products, categories, brands, barcodes
├── supermarkets/            chains, store locations, opening hours, proximity search
├── shopping-lists/          lists, items, quantities, expected prices, sorting
├── shopping-sessions/       trips, purchases, actual prices, running totals
├── pricing/                 price observations, trust evaluation, retention
├── contributions/           price reports, evidence, trip contributions
├── price-intelligence/      derived prices, daily history, confidence, trends
├── external-price-sources/  source registry, adapters, scheduled imports
├── optimization/            (phase 7)
└── notifications/           (phase 8)
```

A module may depend on another module's **domain types and ports** — that is
how `auth` reads accounts, through the `USER_REPOSITORY` port that `users`
exports. No module may import another module's `infrastructure/`. This is
enforced by a test, not just documented (`test/architecture.e2e-spec.ts`).

### Catalog rules

Two rules shape the catalog. The first is enforced by tests
(`src/products/application/product-identity.spec.ts` and
`test/catalog.e2e-spec.ts`); the second is a modelling decision:

- **Product identity is stable.** A product carries no price and no store, so
  it can be renamed, re-categorized or re-branded without disturbing the price
  history recorded against its id. Products are retired by setting
  `isActive: false`, never deleted.
- **A size is a product.** "Milk 1L" and "Milk 2L" are separate products with
  their own barcodes rather than variants of one, because they are separately
  purchasable and separately priced. `packageSize` + `unit` normalize to
  grams/millilitres so phase 4 can compare price per unit across pack sizes.

Display names are stored alongside an accent-stripped, lower-cased
`normalizedName`, and search normalizes the query the same way — which is what
lets a shopper typing `serenisima` find `La Serenísima`. An `ILIKE` against the
raw name would not, because Postgres does not fold accents.

Barcodes are validated with the GS1 modulo-10 check digit (EAN-8, UPC-A, EAN-13,
GTIN-14) before they are stored, and one code may belong to exactly one product.

Catalog **writes are curated** — `MODERATOR` or `ADMIN` — while reads are open
to any authenticated user. Crowd-sourced *prices* arrive through the pricing
module in phase 4; the product identity they hang off stays editorial.

### Proximity search

There is no PostGIS in this stack. `GET /v1/stores/nearby` filters on a
latitude/longitude bounding box — which the composite index on
`store_locations` serves — and computes exact great-circle distances in the
domain over the handful of rows that box returns. The box over-selects at its
corners, so the radius filter afterwards is what makes a radius a circle rather
than a square.

### Shopping rules

- **Money is integer cents.** Every price is minor units in the list's
  currency (ISO 4217, fixed at creation), and quantities have at most three
  decimals. Line totals are computed as cents × thousandths of a unit and
  rounded once per line, so a long list never drifts by a cent.
- **Totals are the server's.** Lists return `expectedTotalCents`; trips return
  expected, actual, remaining and projected totals. No endpoint accepts a
  total. Items with no known price are counted in `unpricedItemCount` rather
  than silently treated as free.
- **Expected vs actual.** A list holds expected prices. A trip records what
  was actually paid, which overrides the expected price for a purchased line.
  A line confirmed as purchased without a new price counts at its expected
  price.
- **A trip is a snapshot.** Starting a session copies the list's items.
  Editing or deleting the list afterwards leaves the trip untouched, and its
  `listId` becomes null.
- **Trip states.** `ACTIVE ⇄ PAUSED → COMPLETED | ABANDONED`. A paused trip
  still accepts item updates, because edits made offline may sync late. A
  finished trip refuses changes.

### Retries and idempotency

The mobile client retries after connectivity loss, so every mutation that is
realistically retried is safe to repeat:

| Operation | How a retry is absorbed |
| --- | --- |
| Create list, add item, duplicate, start trip | Optional client-generated `id`; a retry returns the existing resource |
| Start trip without an id | A list with a trip in progress returns that trip (serialized by a row lock) |
| Update item (list or trip) | Absolute values, not deltas; a replayed "purchased" keeps its original time |
| Delete list or item | Deleting something already gone returns 204 |
| Pause / resume / complete / abandon | Reaching the current state is a replay: 200, no write, no event |
| Item update on a finished trip | Accepted if it changes nothing, 409 otherwise |

Completion takes the session's row lock, and so does every item write. Two
concurrent "finish" requests therefore complete the trip once and publish
`ShoppingSessionCompleted` once, and no purchase can land after the event's
snapshot.

### Price observations

Every price enters through one pipeline in `pricing`
(`IngestPriceObservationService`), whatever its source:

```
plausibility → replay / duplicate → catalog → rate limits → trust → pricing_db → events
```

- **Refused, nothing stored:** anything that cannot be a price. That covers
  non-positive or absurd amounts, a bad currency, a time in the future or
  too old, an unknown product or store, a retired product (for reports), and
  exceeding a hard rate limit (429).
- **Stored with a status:** anything that is a price. `ACCEPTED`
  observations may shape derived prices (phase 5). `FLAGGED` ones are held
  back until independently confirmed. `REJECTED` ones are kept only as an
  abuse trail. Contributors see `ACCEPTED`, `UNDER_REVIEW` or `REJECTED`,
  never the internal reason codes, since those describe the heuristics.
- **Source affects trust, not eligibility:** `PURCHASE_CONFIRMED` gets the
  most benefit of the doubt, then `USER_WITH_EVIDENCE`, then `USER_REPORTED`.

| Control | Scope | Effect |
| --- | --- | --- |
| Per IP, per account (60/h) | user reports | 429 |
| Same account + product + store (5/day) | user reports | 429 |
| Third report of the same product/store in a day | user reports | flag |
| Account volume, product spike, store spike | user reports | flag |
| Account younger than 24h | user reports | flag |
| Moderate deviation from recent median | bare reports | flag |
| Extreme deviation from recent median | reports / purchases | reject / flag |
| Repeated deviations by one account (7 days) | user reports | flag |

Volume spikes on a product or store flag rather than refuse. An attacker
flooding one product must not be able to lock honest shoppers out of
reporting it.

Deviation is measured against the **median** of recent accepted prices, first
at the same store, then across stores with looser thresholds. A median only
moves when most recent prices move, so it can't be walked off course one
submission at a time.

Raw observations are operational data. A daily job prunes those older than
`PRICE_OBSERVATION_RETENTION_DAYS` (default 90). The long-lived history is
the daily aggregate phase 5 derives.

### Contributions

- **Explicit report:** `POST /v1/price-observations`. An optional photo is
  uploaded first to `POST /v1/price-evidence` (JPEG, PNG or WebP, identified
  by content rather than name, 5 MB, 30 uploads per hour). The returned key
  names its owner, so a report can only cite its author's own photo. Evidence
  storage is behind a port. The local-disk adapter suits a single instance,
  and an object store replaces it in production.
- **Shopping trips:** completing a trip turns each purchased line with an
  actual price into a `PURCHASE_CONFIRMED` observation, with no extra step
  for the shopper. The completion event only enqueues a job, and the worker
  does the ingestion. Each line's observation is keyed by the line id, and a
  ledger in `pricing_db` records finished trips, so re-running a trip is
  harmless. Because the event bus is in-process, a sweep every 10 minutes
  queues any completed trip from the last 48 hours with no ledger entry. A
  lost event delays a contribution; it never drops it.

### Price intelligence

Observations are raw events; a price is a derived view. Nothing overwrites a
current price — it is recomputed from every observation still in the 30-day
window, weighted by:

- **source** — a confirmed purchase or a supermarket feed counts double a
  typed report, with evidence-backed reports in between;
- **recency** — weight halves every 7 days, never reaching zero, because some
  price beats no price;
- **corroboration** — a flagged observation is left out until at least two
  *other* contributors report much the same price, and even then counts for
  less. Rejected ones never count.

The formula lives behind one domain function, since it is a business judgement
that will change.

Confidence is scored 0..1 from freshness, weight of evidence and how much the
observations agree. Clients see only the level it maps to — `VERY_RECENT`,
`RECENTLY_VERIFIED`, `LIKELY_CURRENT`, `POSSIBLY_OUTDATED` — because a bare
0.62 invites a reader to invent a meaning for it.

**Daily aggregation** compresses each day into one row per product and store
(weighted average, min, max, observation count, confidence). That is what
makes history affordable: observations are pruned after 90 days, the daily
rows are kept. A day whose average jumps 1.5× against the previous one is
marked anomalous, publishes `PriceAnomalyDetected`, and is excluded from trend
summaries while staying visible in the series.

Both jobs are idempotent: a recompute rewrites one row from what is in the
database, and re-aggregating a day reproduces that day exactly — the day's
observations are weighed as of the day's end, so a day aggregated tonight and
re-aggregated next month give the same numbers. Recomputes are debounced by
5 seconds and collapse per product and store, so a finished shopping trip
causes one recompute per store, not one per line.

**Reads** are served from Redis where possible. Cache keys carry a per-product
version that a recompute increments, so a new price is visible at once and
invalidation costs one `INCR` rather than a keyspace scan. Every cache path
fails soft: Redis being down costs latency, not availability.

### External price sources

A supermarket integration is an **adapter** behind one contract:

```ts
interface PriceSourceAdapter {
  fetchProducts(context): Promise<ExternalProduct[]>;
  fetchPrices(context): Promise<ExternalPrice[]>;
}
```

Authentication, pagination, request shapes, field names and the provider's
own idea of what a price is all stay inside the adapter. Two ship today:
`json-http` (a configurable JSON feed) and `sandbox-file` (JSON fixtures on
disk, confined to `EXTERNAL_SOURCE_SANDBOX_DIR`, for development and tests).
Adding a supermarket means writing an adapter and registering a source —
the pricing domain does not change.

Imported prices are **not a separate path**: they become `EXTERNAL_API`
observations through the same ingestion pipeline as a shopper's report, so the
same plausibility checks, deviation rules and weighting apply to a feed.

**Product matching** runs in order of certainty — an existing link, then a
valid barcode, then an exact normalized name *and* package size. Anything
ambiguous (two products of the same name and size) is left `UNMATCHED` for a
person to decide through the API, and nothing here ever creates a canonical
product: a wrong match splits a product's price history in two. Store mappings
are always manual for the same reason.

**Scheduling and isolation.** Each source has its own UTC hour. A sweep every
10 minutes queues one job per due source, so a supermarket that is down,
slow or misconfigured fails its own run and leaves the others alone — and a
day missed during an outage is caught up later that day rather than skipped.
Runs are keyed by source and day, so the scheduler and an operator pressing
"import now" cannot import twice, and each observation is keyed by run,
product and store, so a retry after a crash fills in only what is missing.

Run status is `STARTED`, `COMPLETED`, `PARTIAL` or `FAILED`. `PARTIAL` means
the source answered but some of it could not be used — unmatched products,
prices for unmapped branches — which is the review queue, not an incident.

Credentials never live in the registry row: they come from
`EXTERNAL_SOURCE_TOKENS`, a JSON map of source slug to token.

### Databases

Three logical databases with no cross-database foreign keys and no distributed
transactions. Effects that cross a boundary travel as domain events.

| Database | Owns | Schema |
| --- | --- | --- |
| `core_db` | identity, catalog, lists, sessions | `prisma/core/` |
| `pricing_db` | raw price observations, ingestion metadata | `prisma/pricing/` |
| `intelligence_db` | derived prices, daily history, confidence | `prisma/intelligence/` |

`intelligence_db` is rebuildable: dropping its rows and re-running the
recompute and aggregation jobs reconstructs them from whatever observations
are still inside pricing's retention window.

Each has its own `prisma.config.ts` and generated client (in `generated/`,
which is gitignored and rebuilt on install). Prisma commands take the config
explicitly:

```bash
npx prisma migrate dev --config prisma/core/prisma.config.ts
```

### Endpoints

| Route | Who |
| --- | --- |
| `POST /v1/auth/register\|login\|refresh\|logout` | public |
| `GET\|PATCH /v1/users/me` | the account holder |
| `GET\|PATCH /v1/users/me/preferences` | the account holder |
| `GET /v1/products` (text search, category, brand) | any authenticated user |
| `GET /v1/products/:id` | any authenticated user |
| `GET /v1/products/barcode/:code` | any authenticated user |
| `GET /v1/categories`, `GET /v1/brands` | any authenticated user |
| `GET /v1/supermarkets`, `GET /v1/supermarkets/:id` | any authenticated user |
| `GET /v1/stores`, `GET /v1/stores/:id` | any authenticated user |
| `GET /v1/stores/nearby` | any authenticated user |
| `POST /v1/products`, `PATCH /v1/products/:id`, `POST /v1/products/:id/barcodes` | moderator, admin |
| `POST /v1/categories`, `POST /v1/brands` | moderator, admin |
| `POST /v1/supermarkets`, `POST /v1/stores` | moderator, admin |
| `POST\|GET /v1/shopping-lists`, `GET\|PATCH\|DELETE /v1/shopping-lists/:id` | the list owner |
| `POST /v1/shopping-lists/:id/duplicate` | the list owner |
| `POST /v1/shopping-lists/:id/items`, `PATCH\|DELETE .../items/:itemId`, `PUT .../items/order` | the list owner |
| `POST\|GET /v1/shopping-sessions`, `GET /v1/shopping-sessions/:id` | the trip owner |
| `PATCH /v1/shopping-sessions/:id/items/:itemId` | the trip owner |
| `POST /v1/shopping-sessions/:id/pause\|resume\|complete\|abandon` | the trip owner |
| `POST /v1/price-observations`, `POST /v1/price-evidence` | any authenticated user |
| `GET /v1/price-observations/mine` | the contributor |
| `GET /v1/products/:id/prices` (optionally near a location) | any authenticated user |
| `GET /v1/products/:id/prices/history` (30d, 90d, 6m, 1y) | any authenticated user |
| `GET\|POST /v1/price-sources`, `GET\|PATCH /v1/price-sources/:id` | admin |
| `GET /v1/price-sources/adapters` | admin |
| `POST\|GET /v1/price-sources/:id/imports` | admin |
| `GET /v1/price-sources/:id/products`, `POST .../products/:externalProductId` | admin |
| `GET\|POST /v1/price-sources/:id/stores`, `DELETE .../stores/:externalStoreId` | admin |
| `GET /v1/health`, `GET /v1/health/live` | public |

### API conventions

- **Versioning** — URI-based, `/v1/...`.
- **Validation** — global `ValidationPipe` with `whitelist` and
  `forbidNonWhitelisted`, so unknown properties are rejected rather than
  ignored.
- **Errors** — one shape everywhere:
  ```json
  {
    "statusCode": 401,
    "error": "Unauthorized",
    "message": "Missing bearer token",
    "path": "/v1/users/me",
    "requestId": "…",
    "timestamp": "…"
  }
  ```
- **Request ids** — accepted from `x-request-id` or generated, echoed on the
  response, and available to logs through `AsyncLocalStorage`.
- **Pagination** — 1-based `page` plus a bounded `pageSize` (`PaginationQuery`).

### Security

Authentication is **on by default**: `JwtAuthGuard` is global, and a route is
public only if it says `@Public()`.

- Argon2id password hashing.
- Short-lived JWT access tokens (15 min by default).
- Opaque refresh tokens, stored hashed, rotated on every use. Replaying a
  rotated token revokes the user's whole session family.
- Redis-backed fixed-window rate limiting, applied before authentication.
- `helmet` security headers.
- `assertOwnership()` as the single ownership rule for user-owned resources.
- User-owned routes are addressed as `me`, never `/users/:id` — the shape that
  invites an ownership bug simply does not exist.
- Role-restricted routes use `@Roles()` with `RolesGuard`; roles are granted in
  the database, never through the API.

### Domain events

`EventBus` is in-process publish/subscribe for business facts. A failing
subscriber is logged and isolated — it cannot fail the operation that
published the fact. Durable or retryable work belongs on a BullMQ queue
instead. The catalog and its consumers are documented in
`src/common/events/event-catalog.ts`.

## Testing

- **Unit** (`src/**/*.spec.ts`) — business rules against ports, no
  infrastructure. Run with `pnpm run test`.
- **Integration** (`test/*.e2e-spec.ts`) — the real application graph over real
  PostgreSQL and Redis, booted through the same `configureApp()` the
  production process uses. Run with `pnpm run test:e2e`.

Integration tests use their own databases (`*_test`, created by `init.sql`);
`test/global-setup.js` applies all three databases' migrations before the suite
runs, and `.env.test` points the app at them.
