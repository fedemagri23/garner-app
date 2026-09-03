# Phase 5 — Price Intelligence and Historical Tracking

## Objective

Transform short-lived price observations into useful, compact, and trustworthy price intelligence.

## 1. Intelligence database

Create `intelligence_db`.

Long-lived data:

```text
CurrentDerivedPrice
DailyPriceHistory
```

Potential daily record:

```text
product_id
store_id
date
weighted_average
min_price
max_price
observation_count
confidence
```

## 2. Weighted current price

Do not use a simple average by default.

Weight inputs using signals such as:

- recency;
- source type;
- contributor trust;
- purchase confirmation;
- evidence;
- independent confirmations;
- anomaly state.

The exact mathematical formula should live behind a domain service so it can evolve.

## 3. Daily aggregation

At the end of each aggregation period:

```text
raw observations
      ↓
validate usable observations
      ↓
calculate source/reliability weights
      ↓
calculate weighted average
      ↓
calculate min/max
      ↓
calculate confidence
      ↓
store daily record
```

Historical data should be daily, not one permanent record per user submission.

## 4. Current price

Maintain a derived current view optimized for:

```text
product → store → current price
product + location → nearby current prices
```

## 5. Price history

Support:

```text
30 days
90 days
6 months
1 year
```

The history must be generated from daily aggregates.

## 6. Trends

Calculate useful derived signals such as:

```text
price change
trend direction
lowest recent price
average recent price
```

## 7. Confidence

Expose a business-level confidence state such as:

```text
Very recent
Recently verified
Likely current
Possibly outdated
```

Do not expose a raw mathematical confidence score unless required.

## 8. Anomaly detection

Identify:

- extreme price deviations;
- abrupt changes;
- suspicious contributor patterns;
- unusual store/product combinations.

Anomalous observations should be down-weighted or quarantined according to business rules.

## 9. Redis caching

Cache frequently accessed derived data:

```text
product/store current prices
nearby price comparisons
popular products
```

Cache invalidation should occur when relevant intelligence changes.

## Agent acceptance criteria

- daily aggregation is repeatable;
- historical records are compact;
- current price is derived rather than blindly overwritten;
- source-aware weighting exists;
- suspicious observations do not dominate;
- price history endpoints work;
- cached reads behave correctly;
- aggregation jobs are idempotent.

## Deliverable

A scalable price-intelligence layer that converts raw observations into compact historical knowledge.
