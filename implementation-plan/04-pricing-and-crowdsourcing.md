# Phase 4 — Pricing and Crowdsourcing

## Objective

Implement the price-observation pipeline for both explicit user reports and shopping-session contributions.

## 1. Price observations

Create `pricing_db`.

A raw observation conceptually contains:

```text
product_id
store_id
price
observed_at
source_type
user_id when applicable
shopping_session_id when applicable
evidence metadata
```

Possible source types:

```text
USER_REPORTED
PURCHASE_CONFIRMED
USER_WITH_EVIDENCE
EXTERNAL_API
```

Do not expose database internals through the API.

## 2. Explicit price reporting

Flow:

```text
Search product
    ↓
Report price
    ↓
Select store
    ↓
Enter price
    ↓
Optional evidence
    ↓
Submit
```

Create an endpoint for submitting observations.

## 3. Shopping-session contribution

When a user records an actual purchase price:

```text
Shopping Session
    ↓
Actual Price
    ↓
Price Observation
```

This is the preferred crowdsourcing path.

The user should not have to perform a second contribution action.

## 4. Validation

Reject or flag:

- invalid prices;
- impossible quantities/prices;
- unknown product/store;
- unauthorized shopping-session mutations;
- duplicate logical submissions;
- suspicious submission rates.

## 5. Anti-manipulation controls

Implement:

### Rate limiting

Per:

- IP;
- account;
- product;
- store;
- time window.

### Behavioral checks

Detect:

- repeated submissions for the same product/store;
- abnormal price changes;
- unusually high submission volume;
- suspicious new accounts;
- repeated extreme deviations.

Suspicious data must not immediately control the public current price.

## 6. Evidence

Support optional evidence metadata, such as:

```text
photo reference
note
```

The implementation should keep evidence storage abstract so the actual storage provider can change later.

## 7. Retention

Raw observations are temporary operational data.

They should be retained long enough for:

- fraud detection;
- recalculation;
- debugging;
- trust evaluation.

They are not the long-term price history.

## 8. Domain events

Emit:

```text
PriceObservationCreated
PriceObservationAccepted
PriceObservationRejected
```

## Agent acceptance criteria

- explicit user report works;
- shopping purchases generate observations;
- invalid/suspicious observations are handled safely;
- rate limits work;
- duplicate retries do not create uncontrolled duplicates;
- source type is preserved;
- raw observations are stored only in `pricing_db`.

## Deliverable

A trustworthy price-observation pipeline ready for aggregation.
