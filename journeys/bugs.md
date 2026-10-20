# Bug journey

Defects found and repaired, oldest first. Notation: [`README.md`](README.md).

## Phase 2 — identity, catalog, store locations

### BUG-001 — Product search ignored accents in brand names
- **Phase:** 2 · **Area:** products/search · **Scope:** production code · **Found by:** e2e test · **Fixed in:** 4a3d776
- **Symptom:** Searching `serenisima` returned nothing, though "La Serenísima" was in the catalog.
- **Cause:** Only the query was normalized. The brand was matched with `ILIKE` against its display name, and Postgres folds case but not accents.
- **Fix:** Gave `Brand` its own `normalizedName` column and index, written the same way product names already were, and matched against that.

### BUG-002 — Barcode test fixture had an invalid check digit
- **Phase:** 2 · **Area:** products/barcode · **Scope:** test · **Found by:** unit test · **Fixed in:** 4a3d776
- **Symptom:** A "well-formed EAN-13" case failed against correct validation code.
- **Cause:** The fixture number was invented rather than computed, so its GS1 check digit was wrong.
- **Fix:** Computed the correct check digit and used the valid code; kept a deliberately invalid one for the rejection case.

### BUG-003 — Proximity test assumed a store was reachable that was not
- **Phase:** 2 · **Area:** supermarkets/proximity · **Scope:** test · **Found by:** e2e test · **Fixed in:** 4a3d776
- **Symptom:** A test expected a 50 km radius to reach a store 53 km away.
- **Cause:** The fixture distance was never checked against the 50 km cap on what "nearby" may mean.
- **Fix:** Added a mid-distance store to test widening the radius, and kept the far one as the case that is correctly never reached.

## Phase 3 — shopping lists and sessions

### BUG-004 — A purchase could be lost from the completion event
- **Phase:** 3 · **Area:** shopping-sessions/completion · **Scope:** production code · **Found by:** review · **Fixed in:** 5b2ab2d
- **Symptom:** A price recorded at the same moment as "finish trip" could be saved to the database but missing from `ShoppingSessionCompleted` — so it would never become a price observation.
- **Cause:** Completion read the session, then wrote its status. An item write committing in between was invisible to the event's snapshot.
- **Fix:** Both item writes and the status change take the session's row lock (`SELECT … FOR UPDATE`), and the event is built from the session read back inside the completing transaction. A concurrency test asserts one event across three simultaneous completions.

## Phase 5 — price intelligence

### BUG-005 — Aggregation re-run test could not re-run
- **Phase:** 5 · **Area:** price-intelligence/aggregation · **Scope:** test · **Found by:** unit test · **Fixed in:** 6f1cb64
- **Symptom:** A test asserting that re-aggregating a day is idempotent found nothing to aggregate the second time.
- **Cause:** The mock yielded its page of targets once (`mockResolvedValueOnce`), so the second run saw an empty day — the mock, not the code, was non-repeatable.
- **Fix:** Made the mock answer from its arguments, so the day's targets are there on every run.

## Phase 6 — external price sources

### BUG-006 — Stale repository mocks after port changes
- **Phase:** 6 · **Area:** products, price-intelligence · **Scope:** test · **Found by:** typecheck · **Fixed in:** e441b7c, 20e4503
- **Symptom:** Adding a method to a repository port left earlier specs' mocks incomplete. Tests still passed; the full `tsc` run failed.
- **Cause:** `ts-jest` does not typecheck specs, so only `npx tsc -p tsconfig.json` sees it. Recurred in phases 6 and 7.
- **Fix:** Added the missing methods to each mock, and made the full typecheck part of the pre-commit checks rather than relying on the test run.

## Phase 7 — optimization

### BUG-007 — Extra travel was measured against the wrong baseline
- **Phase:** 7 · **Area:** optimization/optimizer · **Scope:** production code · **Found by:** unit test · **Fixed in:** 20e4503
- **Symptom:** A bargain store 30 km away was recommended under a 2 km "extra distance" limit.
- **Cause:** Savings and extra distance were measured against the *cheapest* single-store plan. When the cheapest store was the distant one, its own extra distance came out as zero, and every distance limit stopped meaning anything.
- **Fix:** The baseline is now the *simplest* single-store trip — the nearest store covering the most of the list — which is also the comparison a shopper actually makes.

### BUG-008 — Cheaper rejected alternatives were never generated
- **Phase:** 7 · **Area:** optimization/optimizer · **Scope:** production code · **Found by:** unit test · **Fixed in:** 20e4503
- **Symptom:** `rejectedCheaperAlternatives` was always empty, so the product could never show "you could save more if you allowed another shop".
- **Cause:** Combinations were only generated up to `maxStores`, so a plan just past the limit was never built and therefore never rejected.
- **Fix:** Generate combinations one past the shopper's limit (within the hard cap of 4) purely so they can be reported as rejected. They remain ineligible for recommendation.

### BUG-009 — Optimization fixtures ignored the default constraints
- **Phase:** 7 · **Area:** optimization · **Scope:** test · **Found by:** e2e test · **Fixed in:** 20e4503
- **Symptom:** Two e2e tests expected a two-store split and got a single store.
- **Cause:** The optimizer was right both times: the default preferences require €4 of savings per extra stop and allow 5 km of extra travel, and the fixture's cheap stores were 3–4 km apart and saved €3.
- **Fix:** Made the limits explicit in the test helper so each constraint has its own test, and added a test asserting the defaults do apply when nothing is passed.

## Phase 8 — notifications, hardening, production readiness

### BUG-010 — An oversized request body was reported as a server error
- **Phase:** 8 · **Area:** common/http · **Scope:** production code · **Found by:** e2e test · **Fixed in:** (phase 8)
- **Symptom:** Posting a body past `MAX_REQUEST_BODY_KB` returned 500 rather than 413.
- **Cause:** Body parsing runs as middleware outside Nest and throws a plain error carrying a status, not an `HttpException`, so the exception filter fell through to its 500 branch. It would also have counted the client's mistake as a server error in the metrics.
- **Fix:** The filter now recognizes an error carrying a 4xx status and maps it, with a dedicated message for 413.

### BUG-011 — Health test asserted an exact set of checks
- **Phase:** 8 · **Area:** common/health · **Scope:** test · **Found by:** e2e test · **Fixed in:** (phase 8)
- **Symptom:** Adding the queue check broke a passing test.
- **Cause:** The test used `toEqual` on the whole `checks` object, so any new dependency was a failure rather than an addition.
- **Fix:** Matched the checks it cares about with `toMatchObject`, and asserted the new queue reporting explicitly.


## Post-plan — CI and production follow-ups

### BUG-012 — Delivery tests raced the app's own notification worker
- **Phase:** post-plan · **Area:** notifications · **Scope:** test · **Found by:** CI · **Fixed in:** 98d40c2
- **Symptom:** `sweeps up a message whose delivery was missed` passed locally and failed on the first CI run: `deliverDue()` found nothing to send.
- **Cause:** Integration tests boot the real application, workers included. Evaluating an alert enqueues a delivery job with no delay, and on a fast runner the worker sent the message before the test's sweep looked for it. Every delivery test had the same race; this one lost it first.
- **Fix:** The delivery tests pause the notifications queue while they run, so the use case under test is the only thing delivering, then drain and resume it.

### BUG-013 — A notification deleted mid-delivery failed its job instead of ending it
- **Phase:** post-plan · **Area:** notifications · **Scope:** production code · **Found by:** e2e test · **Fixed in:** 1981c39
- **Symptom:** Foreign-key errors from `notification_channel_deliveries` in the worker log while the notifications suite cleaned up between tests.
- **Cause:** Recording a channel's outcome references the notification. When the notification is deleted while it is being delivered — with its account, or by retention — the write fails, and the delivery was reported as a failure to be retried.
- **Fix:** The ledger reports a vanished notification as such, and delivery stops there: nothing left to send and nothing to retry.

### BUG-014 — Trace ids never reached the jobs a request queued
- **Phase:** post-plan · **Area:** common/observability · **Scope:** production code · **Found by:** review · **Fixed in:** 5e944cc
- **Symptom:** A job's log lines carried a fresh random trace id, unrelated to the request that queued it — the opposite of what the README, `docs/operations.md` and CON-025 described.
- **Cause:** The worker side read `traceId` from the job's data, but no producer ever put it there. The consumer half of the propagation was built; the producer half was not, and no test followed a trace across a queue.
- **Fix:** Propagation moved to OpenTelemetry: BullMQ's telemetry injects the context on every `add` and the worker runs inside a consumer span of the same trace. `test/tracing.e2e-spec.ts` follows one request through to its job.

### BUG-015 — "Import now" during a scheduled import ran the same slot twice
- **Phase:** post-plan · **Area:** external-price-sources · **Scope:** production code · **Found by:** load test · **Fixed in:** 5215247
- **Symptom:** In the load environment, a feed's run reported 28,118 confirmations and 2,051 new observations for a fixture in which 3,017 prices had moved. The stored data was right; the run's totals were not, and the import took twice as long as it should have.
- **Cause:** `startOrResume` treated every `STARTED` run as one left behind by a crash and resumed it. The scheduler's job was still working on the slot when an HTTP "import now" arrived, so both executed the whole feed side by side; dedupe keys kept the rows single, and whichever finished last overwrote the totals. Two triggers creating the slot at the same instant could also fail one of them on the unique key.
- **Fix:** Runs carry a heartbeat, refreshed every 250 prices. A `STARTED` run is taken over only once its heartbeat is five minutes old, by a conditional update only one claimant can win; otherwise the second trigger returns the running run untouched. A lost create race resolves to the winner's run.

### BUG-016 — Queues ignored the database index in REDIS_URL
- **Phase:** post-plan · **Area:** common/queue · **Scope:** production code · **Found by:** load test · **Fixed in:** dfe7c80
- **Symptom:** With the load environment configured for Redis database 2, its workers took jobs queued by the integration tests in database 0, and fifteen queue-dependent tests failed.
- **Cause:** The BullMQ connection was assembled from the URL's host, port and credentials, and dropped the path — the database index — and the `rediss://` scheme. The cache client was right only because it passes the URL to ioredis whole. Any two deployments sharing a Redis by database index would have consumed each other's jobs, against each other's databases.
- **Fix:** `bullConnectionFrom` builds the connection from the whole URL: database index, TLS for `rediss://`, decoded credentials, and a refusal of an index that is not a number.

### BUG-017 — The committed API contract left out the /v1 prefix
- **Phase:** post-plan · **Area:** api contract · **Scope:** production code · **Found by:** mobile client generation · **Fixed in:** 9cabb49
- **Symptom:** The mobile app's generated client had no `/v1/auth/login`, only `/auth/login`; every path in `openapi.json` lacked the prefix the running API serves.
- **Cause:** The export script enabled versioning with the raw enum value `1`, which is header versioning, not URI. CI's drift check compared the file against that same script, so it agreed with itself.
- **Fix:** One `applyVersioning` used by both the app and the export, and an integration test comparing the committed file with the document the fully configured app builds.

### BUG-018 — Nullable fields were described as bare objects in the contract
- **Phase:** post-plan · **Area:** api contract · **Scope:** production code · **Found by:** mobile client generation (checkpoint 2) · **Fixed in:** b23c522
- **Symptom:** 81 response and request fields — `imageUrl`, `packageLabel`, a saved `latitude`, every nullable date — came out of `openapi.json` as `type: object`, so the generated client typed them `Record<string, never> | null` and the app could not read a product's package label or a saved location.
- **Cause:** `@ApiProperty({ nullable: true })` on a `string | null` property. TypeScript emits `Object` as the design type of a union, and Swagger reads that as an object schema unless the decorator names the type.
- **Fix:** Every nullable property names its type (`type: String` / `Number`, with `format: 'date-time'` for timestamps). The OpenAPI integration test now fails on any free-form object field other than a price source's adapter `config`.

### BUG-019 — "Open now" was read on the server's clock
- **Phase:** post-plan · **Area:** supermarkets · **Scope:** production code · **Found by:** adding Vienna stores to the seed · **Fixed in:** this commit
- **Symptom:** A Vienna store open 07:30–20:00 would read as open at 21:30 Vienna time, because 21:30 there is 16:30 in Buenos Aires. Buenos Aires stores were wrong too on any server not running on Argentine time — 3 hours off on a UTC container, which is what CI and most deploys use.
- **Cause:** `isOpenAt` read `Date#getDay` and `getHours` in the runtime's local zone. The per-store zone the code comment promised for phase 6 was never added.
- **Fix:** Stores have a `timeZone` (IANA, default `America/Argentina/Buenos_Aires`, validated on create and returned by the API), and `isOpenAt` reads the weekday and time on that zone's clock with `Intl.DateTimeFormat`.

### BUG-020 — A product's history averaged pesos with euros
- **Phase:** post-plan · **Area:** price-intelligence · **Scope:** production code · **Found by:** adding Vienna stores to the seed · **Fixed in:** this commit
- **Symptom:** The product-wide history of a product priced in Buenos Aires and Vienna merged 1.390 pesos (139000 cents) and 1,39 euros (139 cents) into one daily "average" in neither currency.
- **Cause:** `mergeByDate` weighed every store's day together, and history points did not carry their currency.
- **Fix:** Points carry their currency; the history keeps one — the requested `currency`, else the one with the most observations — and says which in the response.
