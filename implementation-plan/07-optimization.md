# Phase 7 — Smart Shopping Optimization

## Objective

Given a shopping list, recommend the best supermarket strategy while respecting user constraints.

## 1. Optimization request

Inputs:

```text
shopping list
user location
maximum supermarkets
maximum distance
maximum extra time
minimum savings threshold
preferred stores
excluded stores
optimization mode
```

Modes:

```text
CHEAPEST
BEST_BALANCE
SIMPLEST
```

## 2. Data sources

The optimizer reads:

- products/list quantities from `core_db`;
- derived current prices from `intelligence_db`;
- store locations from `core_db`.

It must not calculate price intelligence from raw observations.

## 3. Candidate generation

For each candidate store combination:

```text
identify covered products
calculate product cost
calculate travel implications
calculate missing products
apply constraints
```

## 4. Constraints

Examples:

```text
maximum stores = 2
maximum additional distance = 5 km
maximum extra time = 20 min
minimum savings to justify another store = €4
```

An invalid combination must not be presented as a valid recommendation.

## 5. Recommendation results

Return understandable alternatives:

### Cheapest

Lowest shopping cost among valid combinations.

### Best balance

A trade-off between cost and travel/complexity.

### Simplest

Prefer fewer stores and minimal additional travel.

The scoring implementation should remain isolated so the formula can evolve without rewriting the API.

## 6. Route

A selected optimization result should include:

```text
store order
products assigned to each store
expected spending per store
total expected spending
estimated travel
estimated time
```

## 7. Asynchronous execution

Use BullMQ for optimization jobs when computation is non-trivial.

Flow:

```text
API
 ↓
OptimizationRequested
 ↓
BullMQ
 ↓
Optimization Worker
 ↓
Calculate
 ↓
Persist result
 ↓
OptimizationCompleted
```

Small/simple optimizations may eventually be executed synchronously, but the application should not depend on synchronous execution.

## 8. Caching

Cache reusable results where practical, but invalidate them when relevant:

- prices change;
- store availability changes;
- list changes;
- constraints change.

## Agent acceptance criteria

- optimizer respects every explicit constraint;
- at least Cheapest/Best Balance/Simplest work;
- product quantities are correctly included;
- prices come from derived intelligence;
- results include store assignments;
- long-running jobs do not block API requests;
- job retries are safe;
- optimization results are testable with deterministic fixtures.

## Deliverable

The core differentiator: a shopping list can be converted into an actionable purchasing strategy.
