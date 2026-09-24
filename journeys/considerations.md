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
- **Phase:** 2 · **Area:** products, supermarkets · **Status:** deferred
- **What:** A fresh database has no categories, products or stores; they must be created through the moderator endpoints.
- **Why:** No phase has required a populated development environment.
- **Revisit when:** Onboarding a developer or demoing the app takes more than a moment; a seed script is the fix.

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
- **Phase:** 4 · **Area:** contributions/evidence · **Status:** deferred
- **What:** The `EvidenceStorage` port is implemented by a local-disk adapter under one directory.
- **Why:** The port is the point; a provider can be swapped without touching the contribution flow. Disk suits development and a single instance.
- **Revisit when:** More than one instance runs — the directory would have to be shared, which is where an object store belongs.

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
