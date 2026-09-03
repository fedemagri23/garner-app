# Backend Architecture — Graner: Smart Grocery Price Comparison

## 1. Architecture Goal

Build the first production-capable backend as a **modular monolith** with clear domain boundaries, while separating data by purpose from day one.

The architecture must support:
- 1M-user growth without requiring an architectural rewrite;
- separation between transactional data, price intelligence, and derived/read-heavy data;
- asynchronous processing for ingestion, price calculations, notifications, and optimization;
- protection against price manipulation and abuse;
- easy extraction of heavy modules into independent services later.

> **Core principle:** One deployable backend initially, multiple logical data stores, asynchronous workers, and strict domain boundaries.

Do not introduce microservices just for the sake of scaling.

## 2. Backend High-Level Scheme

```text
                              ┌──────────────────────┐
                              │      Mobile App      │
                              │ React Native + Expo  │
                              └──────────┬───────────┘
                                         │
                                      HTTPS
                                         │
                              ┌──────────▼───────────┐
                              │         API          │
                              │       NestJS         │
                              │    Modular Monolith  │
                              └──────────┬───────────┘
                                         │
             ┌───────────────────────────┼────────────────────────────┐
             │                           │                            │
             ▼                           ▼                            ▼
      ┌──────────────┐          ┌────────────────┐           ┌────────────────┐
      │ Identity     │          │ Shopping       │           │ Products       │
      │ Security     │          │ Lists          │           │ Stores         │
      └──────┬───────┘          └───────┬────────┘           └───────┬────────┘
             │                          │                            │
             └──────────────────────────┼────────────────────────────┘
                                        │
                                        ▼
                              ┌─────────────────────┐
                              │   PostgreSQL Core   │
                              │ transactional data  │
                              └─────────────────────┘

      PRICE / TRUST DATA                     DERIVED DATA
      ──────────────────                     ────────────

      ┌─────────────────────┐               ┌─────────────────────┐
      │ PostgreSQL Pricing  │               │ Price Intelligence  │
      │ observations        │──────────────▶│ PostgreSQL          │
      │ current raw prices  │               │ daily history       │
      │ source metadata     │               │ weighted averages   │
      └──────────┬──────────┘               │ confidence          │
                 │                          └──────────┬──────────┘
                 │                                     │
                 ▼                                     ▼
      ┌─────────────────────┐               ┌─────────────────────┐
      │ Queue / Event Bus   │               │ Redis               │
      │ BullMQ + Redis      │               │ hot/read-heavy data │
      └──────────┬──────────┘               └─────────────────────┘
                 │
        ┌────────┼───────────────┬───────────────────┐
        ▼        ▼               ▼                   ▼
   Price API   Price          Optimizer         Notifications
   ingestion   intelligence   workers            worker
   workers     workers
        │
        ▼
 External supermarket APIs
```

## 3. Technology Baseline

- **Language:** TypeScript
- **Framework:** NestJS
- **API:** REST + OpenAPI/Swagger
- **ORM:** Prisma
- **Transactional databases:** PostgreSQL
- **Cache:** Redis
- **Queue:** BullMQ
- **Authentication:** JWT access/refresh token strategy
- **Validation:** DTO validation
- **Testing:** Jest
- **Local/dev environment:** Docker Compose

Mobile client direction remains React Native + Expo + TypeScript.

## 4. Database Strategy

Start with one PostgreSQL infrastructure but separate logical databases:

```text
PostgreSQL
├── core_db
├── pricing_db
└── intelligence_db
```

These can later move independently to separate instances/clusters.

### core_db
Owns:
- users/auth metadata;
- products/categories/brands;
- supermarkets/stores/locations;
- shopping lists/items;
- shopping sessions/purchases;
- user preferences;
- optimization preferences;
- alerts.

### pricing_db
Owns:
- raw price observations;
- source metadata;
- ingestion metadata;
- current raw observed prices;
- temporary anti-abuse records.

Raw observations are **not** intended to become permanent history.

### intelligence_db
Owns derived data:
- current derived price;
- daily weighted average;
- daily min/max;
- observation count;
- confidence;
- trend/anomaly information;
- product/store pricing statistics.

This database should be rebuildable from retained pricing inputs where practical.

## 5. Domain Modules

```text
src/
├── auth/
├── security/
├── users/
├── products/
├── supermarkets/
├── shopping-lists/
├── shopping-sessions/
├── pricing/
├── contributions/
├── price-intelligence/
├── external-price-sources/
├── optimization/
├── notifications/
└── common/
```

### Responsibilities

**Auth/Security** — authentication, authorization, token lifecycle, rate limiting, abuse protection.

**Products** — canonical products, categories, brands, barcodes, product matching.

**Supermarkets** — supermarket identity, store locations, metadata, source relationships.

**Shopping Lists** — list/item lifecycle, quantities, expected prices, list preferences.

**Shopping Sessions** — active trip, actual purchase prices, purchased state, running total, completion.

**Pricing** — price observations, source classification, current raw observations, ingestion results.

**Contributions** — explicit user reports and shopping-session contributions.

**Price Intelligence** — weighted averages, current derived prices, daily history, confidence, trends, anomalies.

**External Price Sources** — source registry, adapters, schedules, imports, normalization, source health.

**Optimization** — candidate store combinations, constraints, cost calculation, routes, recommendation ranking.

**Notifications** — price alerts, shopping reminders, recommendation notifications.

## 6. Domain Events

Use internal domain events despite the monolith.

Examples:

```text
UserCreated
ShoppingListCreated
ShoppingListItemAdded
ShoppingSessionStarted
PriceObservationCreated
PriceObservationAccepted
PriceObservationRejected
ExternalPriceImportStarted
ExternalPriceImportCompleted
DailyPriceCalculated
PriceAnomalyDetected
OptimizationRequested
OptimizationCompleted
PriceAlertTriggered
```

Events represent **business facts**, not database actions.

## 7. Sync vs Async

### Synchronous
Use for immediate user operations:
- create/update shopping list;
- add/remove item;
- mark item purchased;
- submit price;
- fetch product/store;
- fetch comparison.

### Asynchronous
Use BullMQ for:
- supermarket imports;
- price aggregation;
- confidence recalculation;
- anomaly detection;
- price alerts;
- large optimization requests;
- notifications;
- maintenance/analytics.

## 8. Price Pipeline

```text
User / External Source
        ↓
Normalize + Validate
        ↓
Anti-abuse checks
        ↓
pricing_db
        ↓
PriceObservationCreated
        ↓
BullMQ
        ↓
Price Intelligence
        ├── weighted current price
        ├── daily aggregate
        ├── confidence
        ├── anomaly detection
        └── alert checks
        ↓
intelligence_db
        ↓
Redis cache
```

All sources use the same conceptual observation pipeline, with source type affecting trust/weight.

## 9. External Price Source Adapters

Developer-managed registry of supermarket integrations.

```text
ExternalPriceSource
        ↓
PriceSourceAdapter
        ↓
┌────────┬────────┬────────┐
│ API A  │ API B  │ API C  │ ...
└────────┴────────┴────────┘
```

Conceptual contract:

```ts
interface PriceSourceAdapter {
  fetchProducts(): Promise<ExternalProduct[]>;
  fetchPrices(): Promise<ExternalPrice[]>;
}
```

The adapter layer must isolate supermarket-specific formats from the core pricing domain.

Daily import:

```text
08:00
 ↓
Create import jobs
 ↓
Run adapter(s)
 ↓
Normalize product identity
 ↓
Normalize prices
 ↓
Validate
 ↓
Create observations
 ↓
Trigger processing
```

Imports must be idempotent.

## 10. Price Trust / Anti-Manipulation

Do not let one submission immediately redefine a price.

Source classifications may include:

```text
EXTERNAL_API
PURCHASE_CONFIRMED
USER_WITH_EVIDENCE
USER_REPORTED
```

Weighting signals may include:
- source reliability;
- recency;
- contributor trust;
- purchase confirmation;
- evidence/photo;
- independent confirmations;
- anomaly status.

Security controls:
- rate limit by user/IP/device/session;
- limit repeated reports for same product/store;
- detect suspicious price deltas;
- detect abnormal submission volume;
- flag low-trust observations;
- optionally require evidence for suspicious submissions.

## 11. Price Storage / History

Long-lived:

```text
CurrentDerivedPrice
DailyPriceHistory
```

Short-lived:

```text
Raw PriceObservation
```

Recommended daily record:

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

Keep raw observations long enough for anti-fraud, debugging, and recalculation, then expire them according to a retention policy.

## 12. Redis

Redis is a cache/coordination system, not the source of truth.

Use it for:
- current product/store price reads;
- nearby price comparisons;
- popular product data;
- rate limiting;
- BullMQ;
- temporary optimization results;
- short-lived locks where required.

## 13. Optimization

```text
API
 ↓
Create OptimizationRequest
 ↓
Queue
 ↓
Optimizer Worker
 ↓
Read core_db + intelligence_db
 ↓
Calculate candidates
 ↓
Persist result
 ↓
OptimizationCompleted
```

Constraints:
- maximum supermarkets;
- maximum distance/time;
- minimum savings threshold;
- preferred/excluded supermarkets;
- cheapest/balanced/simplest modes.

The optimizer should consume **derived price intelligence**, not raw observations.

## 14. Read Model Strategy

Price comparison is expected to be read-heavy.

Preferred path:

```text
API
 ↓
Redis
 ↓ cache miss
intelligence_db
 ↓
Redis
 ↓
API
```

Shape intelligence data around common reads such as:

```text
product → current prices by supermarket
product + location → nearby prices
shopping list → candidate store costs
```

## 15. Data Ownership

Each module owns its business data.

```text
Products           → Product
Pricing            → PriceObservation
Price Intelligence → DailyPriceHistory / DerivedPrice
Shopping           → ShoppingList / ShoppingSession
Optimization       → OptimizationRequest / Result
```

Avoid direct cross-module table mutation. Use domain/application interfaces and events.

## 16. Transaction Boundaries

Use PostgreSQL transactions inside a single owned database/domain.

Do not implement distributed transactions across the three databases.

Cross-database effects should use events:

```text
Local transaction
      ↓
Domain event
      ↓
Queue
      ↓
Other domain/database
```

## 17. Consistency

Strong consistency:
- account state;
- shopping list mutations;
- shopping session state;
- purchases;
- core catalog relationships.

Eventual consistency:
- weighted prices;
- daily history;
- confidence;
- alerts;
- optimization cache;
- analytics.

## 18. Internal Code Organization

Prefer business-oriented modules with technical layers inside each module:

```text
pricing/
├── domain/
├── application/
├── infrastructure/
└── presentation/
```

- **domain** — business rules/entities/value objects;
- **application** — use cases/orchestration;
- **infrastructure** — Prisma, Redis, BullMQ, external adapters;
- **presentation** — controllers/DTOs.

Avoid a global `controllers/`, `services/`, `repositories/` structure that destroys domain ownership.

## 19. API Design Guidelines

Use REST resources around business concepts.

Examples:

```text
POST   /auth/login
GET    /products
GET    /products/:id
GET    /products/:id/prices
POST   /price-observations
POST   /shopping-lists
POST   /shopping-lists/:id/items
POST   /shopping-lists/:id/optimize
POST   /shopping-sessions
PATCH  /shopping-sessions/:id/items/:itemId
POST   /price-alerts
GET    /stores/nearby
```

Do not expose database tables directly as API resources when that conflicts with the business model.

## 20. Security Baseline

Implement from the beginning:
- password hashing through a vetted library when password auth exists;
- short-lived access tokens;
- refresh-token rotation/revocation strategy;
- authorization checks on every protected resource;
- request validation;
- rate limiting;
- secure headers;
- audit/security logging for sensitive actions;
- no secrets in source control;
- parameterized queries through Prisma;
- strict ownership checks for shopping lists and sessions.

## 21. Background Job Rules

Every asynchronous job must be:
- idempotent;
- retry-safe;
- observable;
- bounded in work;
- explicit about failure state.

External imports must support retry without duplicating logical data.

## 22. Agent Implementation Rules

An implementation agent must:

1. implement one bounded domain at a time;
2. establish data ownership before adding dependencies;
3. avoid direct cross-module writes;
4. emit business events for asynchronous consequences;
5. keep raw price observations separate from derived intelligence;
6. use transactions for local consistency;
7. make jobs idempotent;
8. make imports idempotent;
9. validate price submissions before intelligence updates;
10. never trust client-calculated totals/prices for authoritative state;
11. treat Redis as disposable;
12. test business rules independently of controllers;
13. document every domain event and its consumer(s);
14. avoid premature microservice extraction.

## 23. Implementation Sequence

### Phase 1 — Foundation
- NestJS;
- project/module boundaries;
- Prisma;
- core_db;
- auth/security;
- REST/OpenAPI;
- Docker Compose;
- tests.

### Phase 2 — Catalog
- products;
- categories;
- brands;
- supermarkets;
- stores;
- barcodes.

### Phase 3 — Shopping
- shopping lists;
- items;
- shopping sessions;
- purchases;
- totals.

### Phase 4 — Pricing
- pricing_db;
- observations;
- contributions;
- source classification;
- anti-abuse rules.

### Phase 5 — Price Intelligence
- intelligence_db;
- weighted current prices;
- daily history;
- confidence;
- anomaly detection.

### Phase 6 — External Sources
- source registry;
- adapter contract;
- first supermarket adapter;
- scheduled imports;
- idempotency.

### Phase 7 — Optimization
- constraints;
- store combinations;
- cost calculation;
- route recommendation;
- async worker.

### Phase 8 — Notifications
- price alerts;
- shopping reminders;
- optimizer notifications.

## 24. First Deployment

Keep infrastructure simple:

```text
             ┌────────────────┐
             │   NestJS API   │
             └───────┬────────┘
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
 PostgreSQL        Redis        Workers
       │             │             │
   ┌───┼───┐         │       ┌─────┼─────┐
   ▼   ▼   ▼         ▼       ▼     ▼     ▼
 core pricing intelligence  Import Price Optimizer
      (logical DBs)         workers  workers
```

AWS, multiple API instances, read replicas, and independently scaled infrastructure can be introduced later without changing the domain model.

## 25. Architecture Decision

**Recommended starting architecture:**

> **NestJS modular monolith + 3 logical PostgreSQL databases + Redis + BullMQ + domain events + background workers.**

This provides clear business boundaries, independent data lifecycles, efficient historical price storage, asynchronous processing, anti-abuse controls, and a clean path toward extracting high-load domains later.
