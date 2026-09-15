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
├── shopping-lists/          (phase 3)
├── shopping-sessions/       (phase 3)
├── pricing/                 (phase 4)
├── contributions/           (phase 4)
├── price-intelligence/      (phase 5)
├── external-price-sources/  (phase 6)
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

### Databases

Three logical databases with no cross-database foreign keys and no distributed
transactions. Effects that cross a boundary travel as domain events.

| Database | Owns | Schema |
| --- | --- | --- |
| `core_db` | identity, catalog, lists, sessions | `prisma/core/` |
| `pricing_db` | raw price observations, ingestion metadata | `prisma/pricing/` |
| `intelligence_db` | derived prices, daily history, confidence | `prisma/intelligence/` |

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
`test/global-setup.js` applies migrations before the suite runs, and
`.env.test` points the app at them.
