# Phase 6 — External Price Sources

## Objective

Integrate supermarket APIs/sources through developer-managed adapters while keeping supermarket-specific behavior isolated.

## 1. External source registry

Create the `external-price-sources` module.

A source definition should contain high-level configuration such as:

```text
source name
supermarket
adapter type
enabled/disabled
schedule
status
last successful import
```

## 2. Common adapter contract

Use a common application-facing contract:

```ts
interface PriceSourceAdapter {
  fetchProducts(): Promise<ExternalProduct[]>;
  fetchPrices(): Promise<ExternalPrice[]>;
}
```

Additional adapter operations can be introduced only when needed.

## 3. Adapter responsibilities

Each adapter handles:

- authentication to the external source;
- source-specific requests;
- pagination;
- source-specific formatting;
- product normalization;
- price normalization;
- source-specific failure handling.

The core pricing module must not know how Carrefour/Día/etc. work internally.

## 4. Product matching

External products need to map to canonical Garner products.

Prioritize:

1. barcode;
2. known external identifier;
3. deterministic normalized identity;
4. controlled/manual matching when automation is insufficient.

Do not silently create duplicate canonical products.

## 5. Import pipeline

```text
Scheduler
   ↓
Create import job
   ↓
Adapter
   ↓
Fetch external data
   ↓
Normalize
   ↓
Match products
   ↓
Validate
   ↓
Create EXTERNAL_API observations
   ↓
emit PriceObservationCreated
```

External API prices use the same downstream price-intelligence pipeline as community observations.

## 6. Daily schedule

Initial target:

```text
08:00 daily
```

Do not assume every source has the same availability or freshness.

Track import status per source.

## 7. Idempotency

Repeated execution must not create duplicate logical data.

An import should have:

```text
source
execution identifier
external product/price identity
observed timestamp
```

to support safe retries.

## 8. Failure handling

One failed supermarket source must not stop all other imports.

Track:

```text
started
completed
partial
failed
```

and capture useful failure details.

## Agent acceptance criteria

- source registry works;
- adapter contract is enforced;
- first real/sandbox source can be plugged in;
- scheduled job executes;
- retries are safe;
- source failures are isolated;
- external prices enter the same observation pipeline;
- import status is observable.

## Deliverable

A reusable supermarket integration layer that can accept many providers without changing the pricing domain.
