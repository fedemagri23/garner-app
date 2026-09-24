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
