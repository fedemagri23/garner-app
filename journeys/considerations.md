# Consideration journey

Deliberate limits, trade-offs and simplifications, oldest first.
Notation: [`README.md`](README.md).

## Cross-cutting

### CON-001 — Domain events are in-process and can be lost on a crash
- **Phase:** 1 · **Area:** common/events · **Status:** accepted
- **What:** `EventBus` is in-process publish/subscribe. A crash between a transaction committing and its event publishing loses the event.
- **Why:** The system is one deployable, and an outbox table is infrastructure no phase has needed outright. Where the loss would cost real data — shopping trips becoming price contributions — a reconciliation sweep covers it instead (see CON-014).
- **Revisit when:** A second consumer appears whose work cannot be reconstructed by a sweep, or the deployment splits into services.

### CON-002 — Rate limiters and caches fail open
- **Phase:** 1 · **Area:** security, pricing, price-intelligence · **Status:** accepted
- **What:** When Redis is unavailable, rate limit checks allow the request, submission counters read zero, and price caches miss.
- **Why:** These protect capacity and data quality, not authorization. A Redis blip becoming a total outage is the worse failure. Deviation checks live in the database and still apply.
- **Revisit when:** A limiter is ever relied on for authorization, which it should not be.

### CON-003 — Fixed-window rate limiting admits a burst at the boundary
- **Phase:** 1 · **Area:** security/rate-limiting · **Status:** accepted
- **What:** A fixed window allows up to twice the limit across a window boundary.
- **Why:** O(1) work per request. Precision where it matters is handled by the per-user, per-product controls in pricing.
- **Revisit when:** Boundary bursts are observed doing damage; a sliding window is the upgrade.

### CON-004 — Ownership failures answer 403, which reveals that an id exists
- **Phase:** 2 · **Area:** security/ownership · **Status:** accepted
- **What:** Accessing another user's resource returns 403, while a missing one returns 404, so the two are distinguishable.
- **Why:** One ownership rule in one place is worth more than hiding existence, and every id is an unguessable uuid.
- **Revisit when:** Resource ids become guessable, or enumeration is a stated threat.

## Catalog and stores

### CON-005 — A package size is a product, not a variant
- **Phase:** 2 · **Area:** products · **Status:** accepted
- **What:** "Milk 1L" and "Milk 2L" are separate products with their own barcodes, rather than variants of one. The implementation plan names a `ProductVariant`; this departs from it.
- **Why:** Each size is separately purchasable and separately priced, so every price observation stays a plain reference to a product id with no join. `packageSize` + `unit` normalize to grams/millilitres for price-per-unit comparison.
- **Revisit when:** Products need to be grouped for display ("all sizes of this"), which is a read-model concern before it is a schema one.

### CON-006 — Proximity search uses a bounding box and straight-line distance
- **Phase:** 2 · **Area:** supermarkets/geo · **Status:** accepted
- **What:** No PostGIS. A latitude/longitude box (served by a composite index) narrows candidates, then exact great-circle distance filters them.
- **Why:** Accurate enough at city scale, and avoids a database extension for what is a bounded search.
- **Revisit when:** Searches span regions, or polygon queries (delivery zones) are needed.

### CON-007 — The catalog has no seed data
- **Phase:** 2 · **Area:** products, supermarkets · **Status:** resolved
- **What:** A fresh database had no categories, products or stores; they had to be created through the moderator endpoints.
- **Why:** No phase had required a populated development environment.
- **Resolved:** `pnpm run seed` (2026-09-25) writes two accounts, a catalog, three chains with branches, current prices and a fortnight of history. Idempotent, and development-only: it writes to the databases directly and sets a role no API exposes.

## Shopping

### CON-008 — Money is integer cents, one currency per list
- **Phase:** 3 · **Area:** shopping-lists · **Status:** accepted
- **What:** Prices are minor units; quantities carry three decimals; line totals round once. A list's ISO currency is fixed at creation.
- **Why:** Float sums drift by a cent over a long list, and a total a shopper can check by hand has to add up. One currency per list means totals never add amounts that cannot be added.
- **Revisit when:** A shopper needs one list spanning currencies, which is a conversion feature, not a schema change.

### CON-009 — A trip is a snapshot of the list
- **Phase:** 3 · **Area:** shopping-sessions · **Status:** accepted
- **What:** Starting a session copies the list's items. Editing or deleting the list afterwards leaves the trip untouched; `listId` becomes null.
- **Why:** A trip records what actually happened. Rewriting it from a list edited afterwards would falsify purchase history.
- **Revisit when:** Shoppers want to add impulse buys mid-trip — a session-level add, not a re-sync.

### CON-010 — Purchase state lives on the trip, not the list item
- **Phase:** 3 · **Area:** shopping-lists, shopping-sessions · **Status:** accepted
- **What:** The plan lists "purchased state" and "actual price" as list-item fields; they are on the session line instead.
- **Why:** The business spec keeps expected and actual prices conceptually distinct, and one list can be shopped many times.
- **Revisit when:** A list view must show "bought last time", which is a read joining the latest session.

## Pricing and contributions

### CON-011 — Contributors see a status but never the reason
- **Phase:** 4 · **Area:** pricing/trust · **Status:** accepted
- **What:** A report comes back `ACCEPTED`, `UNDER_REVIEW` or `REJECTED`. The internal reasons (new account, deviation, volume spike) are stored but never returned.
- **Why:** Telling an abuser which heuristic fired tells them how to avoid it. A status alone still lets an honest contributor see that a typo was rejected.
- **Revisit when:** Support needs to explain a rejection — that is an admin view over the stored reasons, not a change to the public response.

### CON-012 — Volume spikes flag rather than refuse
- **Phase:** 4 · **Area:** pricing/anti-abuse · **Status:** accepted
- **What:** Per-IP, per-account and per-account-product-store limits refuse with 429. Spikes on a product or a store only flag the observations.
- **Why:** Refusing on product volume would let an attacker flooding one product lock honest shoppers out of reporting it.
- **Revisit when:** Flagged floods start drowning the review queue; the answer is weighting, not refusal.

### CON-013 — Only explicitly priced purchases become observations
- **Phase:** 4 · **Area:** contributions · **Status:** accepted
- **What:** A completed trip contributes a line only when the shopper typed an actual price and the line has a store. Confirming at the expected price contributes nothing, and abandoned trips contribute nothing.
- **Why:** An expected price is the shopper's own earlier guess, not an observation of anything. An abandoned trip is not a confirmed purchase.
- **Revisit when:** Expected prices are prefilled from derived prices — confirming one then really is confirming the system's price.

### CON-014 — Trip contributions are reconciled, not transactional
- **Phase:** 4 · **Area:** contributions · **Status:** accepted
- **What:** Completing a trip queues a job. A ledger records finished trips, and a sweep every 10 minutes queues any completed trip from the last 48 hours with no ledger entry.
- **Why:** Closes the lost-event gap in CON-001 without an outbox table. A lost event delays a contribution rather than dropping it.
- **Revisit when:** A delay of minutes is unacceptable, or other events need the same guarantee — then an outbox earns its place.

### CON-015 — Evidence photos are stored on local disk
- **Phase:** 4 · **Area:** contributions/evidence · **Status:** resolved
- **What:** The `EvidenceStorage` port is implemented by a local-disk adapter under one directory.
- **Why:** The port is the point; a provider can be swapped without touching the contribution flow. Disk suits development and a single instance.
- **Revisit when:** More than one instance runs — the directory would have to be shared, which is where an object store belongs.
- **Resolved:** An S3 adapter sits behind the same port, selected by `EVIDENCE_STORAGE_DRIVER=s3`; local disk stays the default for development. See CON-035.

## Price intelligence

### CON-016 — Weighting and confidence constants are judgement calls
- **Phase:** 5 · **Area:** price-intelligence · **Status:** accepted
- **What:** Source weights, a 7-day recency half-life, the flagged-observation discount, and the confidence formula are chosen numbers, not derived ones.
- **Why:** There is no data yet to fit them to. They live behind one domain function each so they can be retuned without touching callers.
- **Revisit when:** Real contribution data exists to calibrate against.

### CON-017 — History older than the retention window cannot be rebuilt
- **Phase:** 5 · **Area:** price-intelligence · **Status:** accepted
- **What:** `intelligence_db` is rebuildable from observations — but only within pricing's 90-day retention. Daily history older than that has no source left.
- **Why:** Raw observations are operational data; keeping them forever is what the daily aggregates exist to avoid.
- **Revisit when:** Anyone plans to delete `daily_price_history`. It is the long-lived record, and it is not recoverable.

### CON-018 — Cached price views expire by version and TTL
- **Phase:** 5 · **Area:** price-intelligence/cache · **Status:** accepted
- **What:** Cache keys carry a per-product version that a recompute increments; stale entries are never read and expire on their own.
- **Why:** Invalidation costs one `INCR` instead of a keyspace scan, and a new price is visible immediately.
- **Revisit when:** Memory pressure from abandoned keys shows up, which the short TTL should prevent.

## External sources

### CON-019 — `json-http` covers one feed shape
- **Phase:** 6 · **Area:** external-price-sources · **Status:** accepted
- **What:** The generic adapter handles page-number pagination and a JSON array under a configurable key, with renameable fields. Cursor pagination, XML, or signed requests need their own adapter.
- **Why:** That is the contract working as intended: renaming is configuration, a different protocol is code.
- **Revisit when:** Two providers need the same *new* shape — then it is a second generic adapter, not a special case in this one.

### CON-020 — External products are never matched by guesswork
- **Phase:** 6 · **Area:** external-price-sources/matching · **Status:** accepted
- **What:** Matching tries an existing link, a valid barcode, then an exact normalized name *and* package size. Ambiguity leaves the product unmatched for a person, and nothing ever creates a canonical product. Store mappings are always manual.
- **Why:** A wrong match splits a product's price history in two, and a mis-mapped store files real prices against the wrong place. Both are worse than a gap.
- **Revisit when:** The unmatched queue outgrows manual review — the answer is a suggestion UI, still with a person deciding.

### CON-021 — Source credentials live in the environment, not the registry
- **Phase:** 6 · **Area:** external-price-sources · **Status:** accepted
- **What:** `EXTERNAL_SOURCE_TOKENS` holds a JSON map of source slug to token. The database row holds only endpoints and field names.
- **Why:** A credential should not be in a table that an admin API returns.
- **Revisit when:** A secrets manager is introduced; the read point is already one method on the config service.

## Optimization

### CON-022 — Travel figures are estimates, not ETAs
- **Phase:** 7 · **Area:** optimization/travel · **Status:** accepted
- **What:** Straight-line distances, a flat 25 km/h, and a fixed 12 minutes per stop. Stops are ordered nearest-first rather than by an optimal tour.
- **Why:** The numbers are only ever compared against each other to rank plans, and a routing provider is a dependency this phase does not need. With two or three stops, nearest-first is almost always optimal and always predictable.
- **Revisit when:** Minutes are shown to a shopper as a real arrival time, or routes must follow streets — swap in a routing provider behind `travel.ts`.

### CON-023 — A reused optimization can be up to 15 minutes stale
- **Phase:** 7 · **Area:** optimization · **Status:** accepted
- **What:** The fingerprint covers the list contents, the constraints and a rounded location — not prices. An identical question reuses its answer for 15 minutes.
- **Why:** Prices change continuously; hashing them would defeat the cache entirely.
- **Revisit when:** Prices move fast enough within 15 minutes to change a recommendation — then invalidate on `DerivedPriceUpdated` for the products on the list.

### CON-024 — The search is bounded by design
- **Phase:** 7 · **Area:** optimization/optimizer · **Status:** accepted
- **What:** At most 12 candidate stores, at most 4 stores in a plan whatever the shopper configures, and combinations only one past their own limit.
- **Why:** Combinations grow quickly, and beyond a dozen stores the extra candidates are further away and rarely change the answer. No shopper visits five shops.
- **Revisit when:** A dense city centre is shown to have more than 12 genuinely competitive stores for one list.

## Notifications and operations

### CON-025 — Tracing is hooks, not an exporter
- **Phase:** 8 · **Area:** common/observability · **Status:** resolved
- **What:** A trace id is accepted from the caller or minted, carried through `AsyncLocalStorage`, written on every log line, and passed into jobs. There is no OpenTelemetry dependency, no spans and no exporter.
- **Why:** The correlation is what makes logs followable across the API and its workers today, and it is the part that would have to exist anyway. An exporter is a dependency and a collector to run, for a system that is one process.
- **Revisit when:** The deployment splits into services, or a latency question needs per-span timings rather than per-request ones.
- **Resolved:** OpenTelemetry now provides the trace ids, a span per request, Prisma query spans and job spans, exported over OTLP when an endpoint is configured. The claim above that trace ids were passed into jobs was not true at the time — see BUG-014. Limits of the current tracing are in CON-038.

### CON-026 — Metrics are in-process and reset on restart
- **Phase:** 8 · **Area:** common/observability · **Status:** accepted
- **What:** Counters, histograms and gauges live in memory and are exposed at `GET /v1/metrics`. A restart resets them.
- **Why:** One deployable, and a scrape endpoint is all a monitoring stack needs. Prometheus treats a reset as a counter reset, which `rate()` already handles.
- **Revisit when:** More than one instance runs — then each exposes its own numbers and they must be aggregated by the scraper, which is normal, or by a push gateway, which is not.

### CON-027 — The metrics endpoint is admin-only
- **Phase:** 8 · **Area:** common/observability · **Status:** accepted
- **What:** `/v1/metrics` requires an administrator token, and scrapers authenticate like any other client.
- **Why:** Route names, queue depths and error counts describe the system's shape and load. That is not something to hand to anyone who asks.
- **Revisit when:** The endpoint is bound to an internal interface a scraper reaches directly, which would make the token redundant.

### CON-028 — Notification delivery is an inbox, not a push
- **Phase:** 8 · **Area:** notifications · **Status:** resolved
- **What:** The only delivery channel stores the message for the client to read from `GET /v1/notifications`.
- **Why:** A real channel for an app that polls, and the port is the point: push, email or SMS is another implementation rather than a change to how alerts are evaluated.
- **Revisit when:** The product needs to reach someone who is not in the app — that is a provider, a device-token store and a consent trail, none of which this phase needs.
- **Resolved:** Delivery now fans out over channels with a per-channel ledger; email is the second channel, opt-in with a consent trail and one-click unsubscribe. Push is still not built — see CON-036.

### CON-029 — Quiet hours hold messages rather than dropping them
- **Phase:** 8 · **Area:** notifications · **Status:** accepted
- **What:** A message raised inside a shopper's quiet period is stored with a later `deliverAt` and released when the period ends.
- **Why:** The news is still worth having at breakfast. Dropping it would make quiet hours a way to lose information rather than defer it.
- **Revisit when:** Held messages pile up into a morning flood; the answer is a digest, not dropping them.

### CON-030 — Alerts are evaluated per price change, over a bounded set
- **Phase:** 8 · **Area:** notifications · **Status:** accepted
- **What:** One price change examines at most 500 alerts watching that product, and reads every other derived price for it to judge "cheapest nearby".
- **Why:** Simple, and correct at the scale this system is built for. The bound stops a popular product from producing unbounded work.
- **Revisit when:** A product has more watchers than that — then alerts want their own index and evaluation in batches, not a bigger limit.

### CON-031 — `TRUST_PROXY_HOPS` must match the deployment
- **Phase:** 8 · **Area:** common/http · **Status:** accepted
- **What:** Express trusts a configured number of proxy hops, defaulting to none, rather than trusting `X-Forwarded-For` blindly.
- **Why:** Trusting an unset header lets any caller spoof their own address and walk past per-IP rate limiting. Getting it wrong the other way makes every request look like the load balancer, throttling all users as one client.
- **Revisit when:** Deploying behind a proxy — this is a setting that must be checked, not assumed. It is in the operations doc for that reason.

### CON-032 — No load testing has been done
- **Phase:** 8 · **Area:** whole system · **Status:** resolved
- **What:** The plan asks for performance verification of search, comparison, submission, import, aggregation and optimization under realistic workloads. Query paths have been indexed by inspection; none has been measured under load.
- **Why:** There is no realistic workload to generate yet — no production traffic, no seeded catalog of representative size.
- **Revisit when:** Before the first real users, with a seeded dataset. The metrics to watch are already exposed; what is missing is the load and a baseline to compare against.
- **Resolved:** `load/` seeds a city-sized dataset and drives it with k6 and a job benchmark; the baseline is in `docs/performance.md`. It found BUG-015, BUG-016 and the import throughput fixed by CON-039. What it leaves open is CON-040.


### CON-033 — CI does not check formatting
- **Phase:** post-plan · **Area:** tooling/ci · **Status:** accepted
- **What:** CI runs lint, typecheck, build, unit and integration tests on every push to `master` and every pull request. It does not run `prettier --check`.
- **Why:** 122 files currently differ from Prettier's output. Gating on it would mean a reformat commit touching most of the codebase, which buries history for no behavioural gain.
- **Revisit when:** Someone wants the gate — run `pnpm run format` once, commit it alone, add the check, and list that commit in `.git-blame-ignore-revs`.

### CON-034 — An unchanged feed price confirms its last observation instead of adding one
- **Phase:** post-plan · **Area:** external-price-sources/pricing · **Status:** accepted
- **What:** When a source reports the same price, in the same currency, as its newest observation for that product and store, and that observation was accepted, the import moves the observation's `lastConfirmedAt` forward instead of writing a row. Weighting, confidence, daily aggregation, deviation sampling and retention all treat the observation as holding from `observedAt` to `lastConfirmedAt`.
- **Why:** A daily full-catalog import would write products × stores rows a day — 10,000 × 50 is 500,000 a day, ~45 million inside the retention window — almost all repeating yesterday. Simply skipping unchanged prices was not an option: the price would age, lose confidence, drop out of the 30-day window and vanish while the supermarket was still publishing it. What is traded: a stable feed price is one observation, so a day's `observationCount` for it is 1 rather than one per import, and the deviation reference samples one price where it used to sample many copies of it. A confirmation skips trust evaluation, which is safe only because it is restricted to an already-accepted row with an identical price.
- **Revisit when:** A source publishes several prices a day and intra-day changes matter, or a reviewer needs a per-import audit trail of what a feed said — at that point store the raw feed separately rather than undo this.

### CON-035 — Evidence object storage is S3-compatible, tested against a mock
- **Phase:** post-plan · **Area:** contributions/evidence · **Status:** accepted
- **What:** `EVIDENCE_STORAGE_DRIVER=s3` stores photos in any S3-compatible bucket under the same keys the disk adapter uses. Integration tests run it against `adobe/s3mock` in the compose stack, not against a cloud provider. Existence checks treat only a 404 as "missing"; any other failure surfaces as an error.
- **Why:** The S3 API is the common denominator of AWS, R2, GCS interop and MinIO, so one adapter covers the realistic choices. A mock catches signing, keys and status handling without credentials in CI. Reading an outage as "photo not found" would have quietly downgraded honest evidence-backed reports, so it fails loudly instead.
- **Revisit when:** Photos need to be shown back to people (that wants pre-signed URLs or a CDN), or a provider's behaviour differs from the mock's in a way that matters — conditional writes, consistency, lifecycle rules.

### CON-036 — Email is the second channel; push waits for a client
- **Phase:** post-plan · **Area:** notifications · **Status:** accepted
- **What:** Notifications go to the in-app inbox and, for people who opted in, by email over SMTP. Push is not implemented. Emails are plain text, and are sent to the account address, which is not verified.
- **Why:** Email reaches people outside the app with nothing but an address the system already holds, and SMTP is spoken by every transactional provider (SES, Postmark, Mailgun), so no provider SDK is needed. Push needs a client to register device tokens; there is no client yet. Sending to an unverified address is bounded: it is opt-in, alerts are throttled per alert, and every message carries an unsubscribe link that works for whoever holds the mailbox.
- **Revisit when:** A mobile or web client exists (push becomes one more `NotificationChannel` plus a device-token store), signups are open to the public (verify the address before allowing email), or messages need branding (HTML templates).

### CON-037 — Unsubscribe links do not expire
- **Phase:** post-plan · **Area:** notifications · **Status:** accepted
- **What:** The token in an unsubscribe link is an HMAC of the user id under `JWT_SECRET`, with no expiry. It can only turn email off, and the endpoint answers identically for genuine, forged and stale tokens.
- **Why:** An email can sit in an inbox for months and its unsubscribe link must still work; an expiring link would be the one that fails when someone finally wants out. A leaked link lets a third party do only what the recipient would want anyway.
- **Revisit when:** The token is ever given a second power, or `JWT_SECRET` rotation becomes routine — rotating it currently breaks every link already sent.

### CON-038 — Spans are opened by hand where ESM rules out auto-instrumentation
- **Phase:** post-plan · **Area:** common/observability · **Status:** accepted
- **What:** The HTTP server span is opened in the request middleware, not by `@opentelemetry/instrumentation-http`/`-express`. Prisma (through its global hook) and BullMQ (through its telemetry option) are traced by their own integrations. Redis commands and outgoing calls to supermarket feeds are not traced, and outgoing requests do not carry `traceparent`. An incoming `x-trace-id` is no longer honoured: a caller joins a trace with W3C `traceparent`.
- **Why:** The application is an ES module, and the HTTP and Express instrumentations patch modules at load time, which under ESM needs a loader hook passed to `node --import` before the app starts — a deployment-level change for spans the middleware gives anyway. An arbitrary `x-trace-id` string cannot be an OpenTelemetry trace id, and keeping two notions of "trace" would put ids in the logs that match nothing in the tracing backend.
- **Revisit when:** Redis latency or a supermarket feed's latency needs explaining span by span — add a span around the adapter call and inject `traceparent` there — or the process is started with the OpenTelemetry loader anyway, at which point auto-instrumentation replaces the middleware span.

### CON-039 — Confirmations are checked in bulk and skip the per-price pipeline
- **Phase:** post-plan · **Area:** external-price-sources/pricing · **Status:** accepted
- **What:** An import offers its prices for confirmation a thousand at a time: one query finds the source's last observation of every pair, one update confirms the unchanged ones. Only new and moved prices go through `ingest` one by one. A confirmation runs the plausibility check but not the catalog checks or trust evaluation, and every confirmation still publishes `PriceObservationConfirmed`, so each queues a recompute.
- **Why:** Measured on the load dataset, the per-price pipeline cost about 10 ms a price — roughly 85 minutes a day per feed for a 10,000-product, 50-store chain, nearly all of it spent rediscovering that a price had not changed. In bulk the same feed of ~30,000 prices imports in under a minute. The skipped checks were already passed by the row being confirmed, which is ACCEPTED and carries the same product, store and price.
- **Revisit when:** The recompute every confirmation queues becomes the bottleneck — at ~13 ms each, ~90,000 a day is about 20 minutes of worker time. A confirmation changes a price's freshness, not its value, so recomputes could then be batched per store or folded into the daily aggregation.

### CON-040 — One process serves HTTP and runs every worker
- **Phase:** post-plan · **Area:** whole system · **Status:** accepted
- **What:** At ~90 requests a second on the reference laptop, medians stay under 20 ms but p95 reaches 200–750 ms, because HTTP handlers, queue workers, Postgres and the load generator share four cores and one pool of ten connections per database. Background work scales linearly: aggregation is ~5 ms a pair (~40 minutes a day at 500,000 pairs) and every feed confirmation queues a recompute (~6 ms each at 170 a second).
- **Why:** One process is the simplest thing to deploy and is fast enough for a launch-sized catalog. Nothing measured points at a code hotspot — the profile is flat, and a bigger pool did not move the tail — so the next gain is structural rather than an optimization.
- **Revisit when:** p95 matters to users, or a day's background work stops fitting in the day. In order: run the workers as their own process (the BullMQ processors already are separable), give Postgres its own machine, then aggregate and recompute per store in batches instead of per pair. `DATABASE_POOL_MAX` sizes the pools once processes are split.

### CON-041 — The daily aggregation first runs when its scheduler is created
- **Phase:** post-plan · **Area:** price-intelligence · **Status:** accepted
- **What:** The aggregation is a BullMQ scheduler that repeats every 24 hours from when it was created, and its first run is immediate. On a fresh Redis — a first deploy, a flushed cache — the whole previous day is aggregated at boot, and the daily run thereafter happens at that time of day rather than at a chosen hour.
- **Why:** Re-running a day is idempotent, so an extra run is wasted work, never wrong data. The cost showed up only in load testing, where a boot-time aggregation ran alongside the measurement.
- **Revisit when:** The aggregation's timing matters — it competes with peak traffic, or downstream consumers expect yesterday's history by a set hour. A cron pattern (`pattern: '30 3 * * *'`) instead of `every` fixes both.
