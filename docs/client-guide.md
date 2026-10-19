# Client guide

What a client of the Garner API — the mobile app first — needs to know that
the OpenAPI document does not say on its own.

## The contract

`openapi.json`, at the root of this repository, is the API contract. Generate
the client from it rather than writing request code by hand; when an endpoint
changes, the app then fails to compile instead of failing in a user's hand.

```bash
# in the app repository, for example with openapi-typescript + openapi-fetch
npx openapi-typescript https://raw.githubusercontent.com/fedemagri23/garner-app/master/openapi.json -o src/api/schema.d.ts
```

- Operation ids are camel case, `<area><Action>`: `productsSearch`,
  `shoppingListsOptimize`, `authRefresh`. They are stable names to build on.
- The file is regenerated with `pnpm run build && pnpm run openapi:export`, and
  CI fails if it is out of step with the code, so `master` always carries the
  contract the code serves.
- A running API serves the same document at `/docs/openapi.json`, and Swagger UI
  at `/docs` when `SWAGGER_ENABLED=true`.

## Reaching the API in development

```bash
docker compose up -d --wait
pnpm run prisma:migrate:deploy && pnpm run seed
pnpm run start:dev               # http://localhost:3000
```

The API listens on every interface, so a phone on the same network reaches it
at `http://<your computer's LAN address>:3000` — `localhost` on a phone is the
phone. The Android emulator reaches the host at `http://10.0.2.2:3000`; the iOS
simulator can use `localhost`.

The seed creates two accounts, password `correct-horse-battery`:
`shopper@garner.test` (a shopper with lists, near central Buenos Aires) and
`admin@garner.test`.

Native apps need no CORS. The Expo **web** target does: its dev server origin
(`http://localhost:8081`) is in `CORS_ORIGINS` in `.env.example`.

## Versioning

Every route is under `/v1`. A change that would break an existing client gets
a new version of that route; additions — new fields, new endpoints — do not.
Clients should ignore fields they do not know.

## Authentication

| Step | Call |
| --- | --- |
| Sign up / sign in | `POST /v1/auth/register`, `POST /v1/auth/login` → `{ accessToken, accessTokenExpiresIn, refreshToken }` |
| Authenticated request | `Authorization: Bearer <accessToken>` |
| Refresh | `POST /v1/auth/refresh { refreshToken }` → a **new** pair |
| Sign out | `POST /v1/auth/logout { refreshToken }` |

- The access token lasts `accessTokenExpiresIn` seconds (15 minutes by
  default). Refresh a little before it expires, or on a 401.
- **Refresh tokens rotate, and reuse is treated as theft.** Each refresh
  returns a new refresh token and kills the old one. Presenting an
  already-used refresh token revokes *every* session of that account. So the
  client must run **one refresh at a time**: when several requests get a 401
  together, the first refreshes and the rest wait for its result. Two
  concurrent refreshes with the same token sign the user out everywhere.
- Store the refresh token in secure storage (`expo-secure-store`), never in
  plain async storage.

## Errors

Every error has the same shape:

```json
{
  "statusCode": 422,
  "error": "Unprocessable Entity",
  "message": "This product has been retired from the catalog",
  "path": "/v1/price-observations",
  "requestId": "4f1c…",
  "timestamp": "2026-10-19T16:00:00.000Z"
}
```

- `message` is a string, or an array of strings for validation errors (400) —
  one per problem, written to be shown.
- Unknown properties in a request body are rejected with 400, not ignored.
- `requestId` (also the `x-request-id` header) is what to put in a bug report.
  A client may send its own `x-request-id`; it is echoed back.
- 429 means a rate limit: back off and retry later. 401 means refresh (above).

## Lists and pages

Paginated endpoints take `page` (from 1) and `pageSize` (default 20, at most
100) and answer `{ data: [...], meta: { page, pageSize, totalItems, totalPages } }`.

## Money, units and time

- Prices are **integer minor units** (`priceCents`) with an ISO currency code;
  format them on the device, never do arithmetic in floating point.
- Timestamps are ISO 8601 in UTC; dates without a time (`2026-10-19`) are UTC
  days.
- Coordinates are decimal degrees; distances are kilometres.
- `GET /v1/price-drops?latitude&longitude` lists products whose price fell by
  3% or more this week at stores nearby, one per product, biggest fall first.
  Falls in a row add up into one drop; a drop disappears when the price climbs
  back to where it started.

## Working offline

The product requires shopping mode to survive a lost connection (business spec
§27). The API is built so a client can queue and retry safely:

- **Price reports** take a client-generated `id` (a UUID v4). Generate it when
  the price is entered, store it with the queued report, and send the same id
  on every retry: a repeat returns the stored observation instead of creating
  a second one. Also send `observedAt` — when the price was seen, not when it
  was synced.
- **Shopping trip items** are updated with `PATCH
  /v1/shopping-sessions/:id/items/:itemId`, which sets state rather than
  toggling it, so replaying the same update is harmless.
- Completing a trip turns its purchased prices into observations on the server;
  nothing else needs uploading.

Show the user what is still waiting to sync.

## Tracing

Responses carry `x-trace-id`. A client that traces its own work can send a W3C
`traceparent` header, and the request joins that trace.

## Rate limits

About 120 requests a minute per client by default, and tighter limits on price
reports (60 an hour per account, 5 a day per account for the same product at
the same store). A well-behaved client never comes close; a retry loop without
backoff will.
