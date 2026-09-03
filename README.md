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
├── common/                  shared infrastructure (config, db, redis, queue, events, http)
├── security/                hashing, JWT, guards, rate limiting, ownership
├── auth/                    registration, login, refresh-token rotation
├── users/                   accounts
├── products/                (phase 2)
├── supermarkets/            (phase 2)
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
