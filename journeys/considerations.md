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

### CON-042 — The API contract is a committed file, checked by CI
- **Phase:** post-plan · **Area:** whole system · **Status:** accepted
- **What:** `openapi.json` is generated from the compiled app (Nest preview mode, no databases) and committed; CI fails when it differs from what the code produces. The mobile app, in its own repository, generates its typed client from that file. CORS is off unless `CORS_ORIGINS` names browser origins — native apps send no `Origin` and need none.
- **Why:** A separate frontend repository needs a contract it can fetch without running the backend, and a drift check makes "the file on master" and "the API on master" the same thing. Generating rather than hand-writing the client turns an incompatible change into a compile error in the app.
- **Revisit when:** The app needs more than one API version at once, or the contract is published as a package rather than read from the repository.

### CON-043 — Price drops are recorded by the recompute, from now on
- **Phase:** post-plan (mobile checkpoint 2) · **Area:** price-intelligence · **Status:** accepted
- **What:** `price_drops` holds one row per product and store, written by the recompute whenever a current price changes: a fall records or extends a drop, a rise back to the starting price ends it. `GET /v1/price-drops` reads drops of the last 7 days at stores in the radius, keeps falls of 3% or more, one per product, and ranks them in memory from at most 500 candidates. It is not cached. Prices derived before this table existed have no drop until they next change.
- **Why:** The recompute is the only place that has the old and the new price at once, so the drop costs one extra read and write per price change and none per request. Deriving drops from the daily history instead would miss today's change and mean comparing two days for every pair near the shopper on every read. The 3% floor hides the peso-or-two drift of a weighted price as its observations age.
- **Revisit when:** A neighbourhood has more than 500 drops in a week, so the cap starts cutting real ones — rank in SQL by `(previous - price) / previous` instead; or the home screen's traffic makes the read worth caching like the comparison is.

### CON-044 — Optimization does not look at currencies yet
- **Phase:** post-plan · **Area:** optimization · **Status:** resolved
- **What:** A shopping list has one currency, fixed at creation, and optimization sums the derived prices of the candidate stores near the shopper without checking theirs. Near the Obelisco every store is in pesos and near Stephansplatz every store is in euros, so a run is consistent within a city — but a peso list optimized in Vienna reports euro cents as pesos.
- **Why:** Until now every store was in Argentina. The seed now has a Vienna neighbourhood for the developer, and fixing lists belongs with the app's lists phase rather than ahead of it.
- **Revisit when:** The app's phase 3 (lists and where to buy). Candidate stores should be those pricing in the list's currency, and creating a list should default its currency from where the shopper is.
- **Resolved:** in c4a79ad, for the app's checkpoint 5 — candidate stores only count prices in the list's currency, and every result records that currency. A peso list in Vienna now finds nothing to buy instead of a wrong total. Defaulting a new list's currency to where the shopper is lives in the app (garner-mobile MBUG-007).

### CON-045 — An optimization answer carries what a map needs
- **Phase:** post-plan (mobile checkpoint 5) · **Area:** optimization · **Status:** accepted
- **What:** `GET /v1/optimizations/{id}` now returns the `origin` the plans were computed from, each stop's coordinates and address, and the result's `currency`. Coordinates and addresses are read when the answer is read, like names; prices and assignments stay as computed.
- **Why:** The app draws the trip on a map and needs the stops' positions; reading them live keeps a moved or renamed store correct, the same rule names already follow. A stop whose store was deleted has null coordinates and is left off the map.
- **Revisit when:** Stores move often enough that a plan's route no longer matches its stored travel times — then snapshot the coordinates with the plan.

### CON-046 — A trip can follow a plan, line by line
- **Phase:** post-plan (mobile checkpoint 6) · **Area:** shopping-sessions · **Status:** accepted
- **What:** `POST /v1/shopping-sessions` takes an optional `optimizationId` (and `mode`, else the plan's recommendation). Each line then takes the store and unit price that plan chose, and lines are ordered by stop; products the plan could not place keep the list's store and price and come last. The plan must be the shopper's, finished, and for the same list; `storeId` and `optimizationId` together are refused.
- **Why:** A trip already had a store per line, but the only ways to fill it were one store for everything or what each list item had been pencilled in for. Copying the plan into the trip keeps the trip a record of what was planned when the shopper walked in, even if the plan or prices change afterwards, and avoids writing a plan's choices back into the list.
- **Revisit when:** Shoppers want to move a line to another store mid-trip — `RecordItemProgressRequest` has no store field yet.

### CON-047 — A contribution names its product and store when read
- **Phase:** post-plan (mobile phase 5) · **Area:** contributions · **Status:** accepted
- **What:** `GET /v1/price-observations/mine` and `POST /v1/price-observations` now return `productName`, `storeName` and `supermarketName` with each contribution, looked up when the answer is built (two queries for a whole page). Nothing about the stored report changes.
- **Why:** A history screen needs to say what was reported where; ids alone would cost the app two requests per row. Reading names live follows the rule plans already use: a renamed store reads correctly, and the price stays as it was reported. A deleted product or store reads "Unknown …".
- **Revisit when:** Names need to be as they were when the price was reported — then snapshot them on the observation.

### CON-048 — A notification carries the facts behind its words; email and push stay in English
- **Phase:** post-plan (mobile phase 6) · **Area:** notifications · **Status:** accepted
- **What:** A price-alert notification now stores why it fired (`reason`), the price and the one before it in minor units, and the currency; and the API returns them with the names of the product, store and chain, read when listed. Alerts return the same names. `title` and `body` are still written by the server — in English, with a bare number — for email and push.
- **Why:** The app speaks Spanish, with pesos and euros; a server sentence like "Leche is now 13.90" cannot say "Leche bajó a $ 1.390 en Día Almagro" for a reader in either currency. Facts let each client write the message in its own words; the server keeps no language of its own.
- **Revisit when:** Email or push reach people who are not served by an app screen — then the server needs the user's language and a template per language for `title` and `body`, which today are English only.

### CON-049 — Push is on the delivery fan-out; registering a phone is the consent
- **Phase:** post-plan (mobile phase 6, checkpoint 10) · **Area:** notifications · **Status:** accepted
- **What:** `POST /v1/devices` registers an Expo push token (moved to whoever registers it last), `DELETE /v1/devices/:token` forgets it, `POST /v1/devices/test` sends a test message. A `push` channel sits beside in-app and email: it applies only to a shopper with at least one token, writes the title and body in Spanish from the stored facts (`pushText`), and forgets tokens Expo reports as `DeviceNotRegistered`. Expo's address is `EXPO_PUSH_URL`; `EXPO_ACCESS_TOKEN` is optional.
- **Why:** The channel port was built for this; adding push touched neither evaluation nor retry. Writing Spanish on the server (unlike email, CON-048) is needed because a push arrives with the app closed, so no screen can compose it. Moving a token on registration stops a shared phone from sending one account's alerts to the next person.
- **Revisit when:** A language other than Spanish is served (push text and the facts-to-words rule are duplicated in the app), or push receipts should be polled to catch errors Expo only reports later.

### CON-050 — Real push is untested on a phone; Expo Go on Android cannot receive it
- **Phase:** post-plan (mobile phase 6, checkpoint 10) · **Area:** notifications · **Status:** open
- **What:** Everything up to Expo's service is tested against a stand-in server. Delivery by Expo to Apple or Google needs a development build, which needs EAS and, for iOS, a paid Apple Developer account; Expo's docs say remote push is unavailable in Expo Go on Android from SDK 53.
- **Why:** Saying so now avoids calling the checkpoint verified when the last hop was never exercised.
- **Revisit when:** A development build exists to try it on a real phone.

### CON-051 — A shopper's shop is published at ten priced products, priced mostly by its creator
- **Phase:** post-plan (mobile phase 8, checkpoint 12) · **Area:** community · **Status:** accepted
- **What:** A COMMUNITY shop is private to its creator until ten distinct products have an accepted price there (`publicationProgress`); then `publishedAt` is set, in the listener for `PriceObservationAccepted`, and everyone sees it. The plan's first draft also required prices from three different people; that was dropped.
- **Why:** Nobody but the creator can see a private shop, so nobody else can price it: the three-people rule could never be met. Abuse is held back instead by the price pipeline (a new account's prices are held for review, extreme prices rejected), one shop a day for a new or low-trust account, refusing the same chain within 50 m, flags once public, and moderation.
- **Revisit when:** Fake shops get through — then require a photo of the shop front, or a nearby check-in, before publishing.

### CON-052 — Who sees what: products are open, shops are not until published
- **Phase:** post-plan (mobile phase 8, checkpoint 12) · **Area:** community · **Status:** accepted
- **What:** A shopper's product shows in search for everyone at once, ranked by `weight` (team products 150, community ones from confirmations ×3, recent pricers ×2, flags −5, a slow slide when untouched). A shopper's shop shows only to its creator — in "nearby" and by id (others get 404) — and is left out of price comparisons, plans, price drops and other people's alerts, even for its creator, until published. Hidden, merged or flag-pulled entries leave search; looking them up by id still works, so old lists and trips keep their names.
- **Why:** The user's rules: products are too many for the team to curate; a shop is only useful once it has prices, and a private one should not shape anyone's results.
- **Revisit when:** A creator wants to see their own private shop's prices in the comparison before it is public.

### CON-053 — Shoppers' products: no pictures from links, exact duplicates refused, suggestions first
- **Phase:** post-plan (mobile phase 8, checkpoint 12) · **Area:** community · **Status:** accepted
- **What:** `POST /v1/products` is open to everyone. A shopper's product is COMMUNITY, its `imageUrl` is ignored, names and descriptions refuse links and markup, it is refused (409) when the same normalized name, brand and size is already there (a missing size matches any), and new or low-trust accounts may add 3 a day (others 30). `GET /v1/product-suggestions?name=` lists likely matches to show before creating. The team skips the duplicate check and the limits; a shopper cannot create brands or categories yet.
- **Why:** Links to pictures let anyone show anything; near-duplicates are the main way a crowdsourced catalog decays, and asking first is cheaper than merging later.
- **Revisit when:** Shoppers need photos of products (upload through evidence storage, reviewed), or brands that are not listed.

### CON-054 — Moderation is API-only; merging and a nightly recount are not built
- **Phase:** post-plan (mobile phase 8, checkpoint 12) · **Area:** community · **Status:** deferred
- **What:** Moderators have `GET /v1/moderation/queue` and `POST /v1/moderation/{products|stores}/:id/{verify|hide|restore}`, each audited. Merging a duplicate into another product (moving barcodes, list items and prices across databases) is not built: hide the duplicate instead. Shop counters come from `store_price_contributors` rows written by the accepted-price listener; a lost event leaves a shop one product short, with no nightly recount to repair it.
- **Why:** Merge touches three databases and every module holding product ids; it deserves its own design. The counters live in core with the rows they count, so they cannot drift except by a missed event.
- **Revisit when:** Duplicates pile up in the queue, or a shop is seen stuck below ten with ten priced products.

### CON-055 — What the app needs from the community API: own additions, what you said, offline ids, unlisted brands
- **Phase:** post-plan (mobile phase 8, checkpoint 13) · **Area:** community · **Status:** accepted
- **What:** `GET /v1/community/mine` lists the products and shops a shopper added (hidden and private ones too, up to 100 each) with one `status` (PRIVATE, PUBLIC, VERIFIED, UNDER_REVIEW, HIDDEN; `additionStatus`) and, for shops, how many products are still to price. `GET /v1/products/:id/viewer-say` and `GET /v1/stores/:id/viewer-say` say whether you added, confirmed or reported it (someone else's private shop stays a 404). `POST /v1/products` takes an optional client `id`: the same person sending it again gets the same product back before any limit or duplicate check, and anyone else gets 409. It also takes `brandName` for a brand that is not listed, found by slug or added; a product with a brand new to the catalog skips the duplicate check, since nothing can share it. Suggestions now carry `brandName`. This replaces CON-053's "a shopper cannot create brands".
- **Why:** The app queues an added product offline and may send it twice when an answer is lost; it must offer confirm or report only when they make sense; and "Mis aportes" needs the status of each entry without guessing from several fields.
- **Revisit when:** Brands named by shoppers fill with variants — then route new brands through moderation as products are.

### CON-056 — The server writes push and email in the shopper's language; categories carry translations
- **Phase:** post-plan (mobile phase 7, checkpoint 14) · **Area:** users, notifications, catalog · **Status:** accepted
- **What:** `users.locale` (es, en or de; Spanish by default) is read and set through `GET`/`PATCH /v1/users/me`; the app sends it when the language is chosen or changes. Push, the test push and alert emails are written from the message's facts in that language by `messageText`, with money formatted as the app formats it in each language (`$ 1.390`, `AR$1,390`, `1.390 ARS`), and the email footer is translated. A message without facts keeps its stored text. Categories have `translations` (`{"en": …, "de": …}`, JSON), returned on every category and product, settable when the team creates one; the app picks its language's name and falls back to the Spanish one. Product, brand and shop names are not translated: they are what is printed on the package or the shop front. API error messages stay English (the app maps statuses to its own words, MCON-006). This replaces CON-048/049's Spanish-only push.
- **Why:** Push and email reach people while the app is closed, so only the server can write them; the shopper's language is the app's, not the phone's, since they may have picked one.
- **Revisit when:** A fourth language is added (one more entry in `LANGUAGES` and in the phrase tables), or categories need translations edited after creation.

### CON-057 — A trip at one store expects that store's prices
- **Phase:** post-plan (mobile, shop detection) · **Area:** shopping sessions · **Status:** accepted
- **What:** Starting a trip with `storeId` (the app now sends the shop it detects) sets each line's expected unit price to that store's current derived price in the list's currency, read through `DERIVED_PRICE_REPOSITORY`; a product with no price there keeps the list's estimate. A plan's prices still win when following a plan.
- **Why:** The list's estimate is the cheapest nearby when the item was added, usually at another store; "Esperado" should be what this shelf is likely to say.
- **Revisit when:** Prices at the store change during a long trip, or the list's currency and the store's differ (the app does not send the store then).

### CON-058 — Barcode lookup through Open Food Facts, from the server, only as a suggestion
- **Phase:** post-plan (mobile phase 9, checkpoint 16) · **Area:** products · **Status:** accepted
- **What:** `GET /v1/product-lookup/{code}?language=` answers CATALOG (our product: open it), OPEN_FOOD_FACTS (name in the shopper's language, first brand, size and unit parsed from the printed quantity, our category from their tags, front photo, their page) or NONE. The server asks `{OPEN_FOOD_FACTS_URL}/api/v2/product/{code}.json` with `OPEN_FOOD_FACTS_USER_AGENT`, a 3 s timeout and at most 90 reads a minute per process; answers are cached in Redis (found a week, missing a day, failures not cached), and any failure is NONE. Adding a product with `photoFromLookup: true` takes the photo of its first barcode from that cache, never from the request, and records `imageSource: OPEN_FOOD_FACTS` so the app credits it (CC BY-SA). Multipacks, two quantities and unknown units give no size rather than a wrong one. The default User-Agent names the project's repository; set the variable to a contact address before launch, as they ask.
- **Why:** Scanning an unknown code is the moment to add a product, and typing name, brand and size in an aisle is what makes people give up. The data is volunteers', so it only fills a form the shopper checks, and the product stays COMMUNITY.
- **Revisit when:** Before launch: a legal look at the ODbL (we copy single products a shopper confirms, never in bulk) and the photo credit; or when Argentine coverage proves too thin and another source is wanted.

### CON-059 — Portuguese is the fourth language
- **Phase:** post-plan (mobile phase 9) · **Area:** i18n · **Status:** accepted
- **What:** `pt` joins `LANGUAGES`: push, test push and email phrases in Brazilian Portuguese, money as `AR$ 1.390`, `€ 1,15`, `R$ 19,90`, category translations (`pt`) seeded, and the lookup prefers `product_name_pt`.
- **Why:** Asked for by the user; Brazil is the largest neighbouring market and its shoppers travel to Argentina.
- **Revisit when:** European Portuguese wording is wanted (this is pt-BR).

### CON-060 — The category taxonomy is a versioned file applied on deploy
- **Phase:** post-plan (mobile phase 10, checkpoint 18) · **Area:** catalog · **Status:** accepted
- **What:** `data/taxonomy.json` lists 20 departments and 121 aisles (two levels), each with names in es/en/de/pt, a MaterialCommunityIcons icon (departments), its position, search synonyms and the Open Food Facts tags that map to it. `pnpm run taxonomy:sync` (run by the seed, and on every deploy after migrations) upserts by slug, never deletes: a category the file no longer lists is retired (`isActive: false`), and an entry with `replaces: [...]` takes over the old one's products. `GET /v1/categories` returns only active categories, in aisle order, with `icon`, `position` and `synonyms`. The barcode lookup maps through `offTags` to the most specific aisle (`categoryForTags`), replacing the hard-coded table of CON-058. A unit test validates the file (unique slugs, ≤ 2 levels, four names, department icons, distinct positions, each Open Food Facts tag in one place). The seed's products now sit in aisles (Pan Lactal in Pan lactal, Agua in Agua, …). `POST /v1/categories` stays for the team and the tests, but anything it creates that the file does not list is retired at the next sync: the file is the source of truth. Search does not yet match category names (checkpoint 20).
- **Why:** A catalog of real products needs real aisles; keeping them in one reviewed file means every environment has the same shape, in every language, and changes go through review.
- **Revisit when:** A third level is needed, or the team wants to edit categories without a deploy.

### CON-061 — Categories have no icons
- **Phase:** post-plan (mobile phase 10) · **Area:** catalog · **Status:** accepted
- **What:** The `icon` column, the taxonomy file's `icon` fields and `CategoryResponse.icon` are removed (migration `20261023200000_drop_category_icon`). Categories are shown by name only. Amends CON-060.
- **Why:** Decided by the user.
- **Revisit when:** The user asks for icons.

### CON-062 — Diet and lifestyle labels on products
- **Phase:** post-plan (mobile phase 10, checkpoint 19) · **Area:** products · **Status:** accepted
- **What:** `products.labels` (text array, GIN index) holds any of `gluten-free`, `vegan`, `vegetarian`, `organic`, `lactose-free`, `sugar-free`, `kosher`, `halal` (`PRODUCT_LABELS`). Shoppers set them when adding a product (unverified like the rest of it), the team can correct them (`PATCH`), the barcode lookup suggests them from Open Food Facts' `labels_tags`, and `GET /v1/products?labels=vegan,gluten-free` returns products carrying every one. Unknown labels are refused (400) on the way in and dropped when read back. The seed's rice is gluten-free and vegan.
- **Why:** Diet is how many people shop (sin TACC above all in Argentina), and it cuts across categories: a gluten-free pasta is still a pasta.
- **Revisit when:** Shoppers need to correct labels on others' products (today only the team can), or more labels are wanted.

### CON-063 — Password reset by a six-digit emailed code
- **Phase:** post-plan (mobile phase 11, checkpoint 22) · **Area:** auth · **Status:** accepted
- **What:** `POST /v1/auth/password-reset {email}` always answers 202 (it never tells whether the email has an account) and, for an active account, emails a six-digit code in the account's language; only its hash, bound to the account, is stored (`password_reset_codes`). At most three codes an hour per account. `POST /v1/auth/password-reset/confirm {email, code, newPassword}` accepts the newest code once, within 30 minutes, until five wrong tries kill it; wrong and expired codes get the same 400. A reset signs the account out of every device. Email sending moved from the notifications module to a shared `EmailModule` (`EMAIL_SENDER`, null without `SMTP_URL`); without a mail server, outside production, the code is written to the server log so the flow can be tried locally.
- **Why:** A code typed on the phone needs no deep links and works the same on web; six digits with five tries per code and three codes an hour make guessing hopeless.
- **Revisit when:** Emails need HTML and a sender domain (SPF/DKIM) for real delivery — part of hosting.

### CON-064 — Account deletion anonymises the account; personal data is erased in one transaction
- **Phase:** post-plan (mobile phase 11, checkpoint 23) · **Area:** users, auth · **Status:** accepted
- **What:** `DELETE /v1/users/me {password}` and the web page `GET/POST /v1/account-deletion` (email and password, no app needed, as the stores require) erase notifications, alerts, notification preferences, devices, trips, plans, lists, preferences, sessions and reset codes, and anonymise the user row: email `deleted-<id>@deleted.invalid` (the real one is free to sign up again), name "Cuenta eliminada", an unusable password hash, `isActive: false`, `deletedAt`. Prices, products, shops, confirmations and flags stay, attached to that anonymous row, so the catalog and others' price history do not break. `PrismaAccountDeletion` lives in the users module but touches other modules' tables, on purpose: deletion must be all or nothing, in one transaction. An access token already issued keeps working until it expires (15 minutes); refresh fails at once. `POST /v1/auth/password {currentPassword, newPassword}` returns a fresh pair and signs out other devices; `POST /v1/auth/logout-all` signs out all. Changing the email is not offered yet (it needs a confirmation code to the new address).
- **Why:** Apple and Google require in-app and web account deletion; erasing contributions would remove prices other people rely on, and they carry no personal data once the account is anonymous.
- **Revisit when:** Price observations need deleting too on request (they keep a contributor id in the pricing database), or email change is wanted.

### CON-065 — Terms, privacy and credits are draft web pages; acceptance is recorded per version
- **Phase:** post-plan (mobile phase 11, checkpoint 24) · **Area:** users, legal · **Status:** accepted
- **What:** `GET /v1/legal/{terms|privacy|credits}?lang=` serves the three documents as plain HTML in es/en/de/pt (texts in `users/domain/legal/`), each marked as a draft pending legal review. The contact for takedowns and privacy requests comes from `CONTACT_EMAIL`; unset, the pages say it will be published before launch. `TERMS_VERSION` names the current terms; sign-up records them with `acceptTerms: true` (`users.termsVersion`, `termsAcceptedAt`), `POST /v1/users/me/terms` accepts them later, and `GET /v1/users/me` says `termsAccepted` so the app can ask accounts on an older version (or none, like those created before this). The texts were written for this checkpoint by the developer side, not a lawyer.
- **Why:** Shoppers publish content and the app uses Open Food Facts data and photos; the stores ask for a privacy policy URL; and acceptance needs a record of what was accepted.
- **Revisit when:** A lawyer reviews the texts, the contact address is chosen, or the terms change (raise `TERMS_VERSION`).
