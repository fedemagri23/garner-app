# Garner Backend Implementation Plan

## Goal

Implement Garner as a production-capable backend using the approved architecture:

- TypeScript
- NestJS modular monolith
- REST + OpenAPI
- Prisma
- PostgreSQL with `core_db`, `pricing_db`, `intelligence_db`
- Redis
- BullMQ
- JWT authentication
- Docker Compose for local development
- Jest

## Implementation strategy

Build the system in vertical, testable phases:

1. Foundation and architecture
2. Identity, security, and catalog
3. Shopping lists and shopping sessions
4. Pricing and crowdsourcing
5. Price intelligence
6. External supermarket sources
7. Shopping optimization
8. Notifications, hardening, and production readiness

## Rules for every phase

- Preserve bounded-domain ownership.
- Prefer business use cases over CRUD-only abstractions.
- Do not introduce microservices.
- Do not add infrastructure that is not required by the phase.
- Write automated tests for business rules.
- Keep asynchronous jobs idempotent.
- Keep Redis disposable.
- Do not allow one module to directly mutate another module's data.
- Update OpenAPI documentation as endpoints are introduced.
- Keep configuration environment-driven.
- Maintain a working Docker Compose environment.

## Definition of done for the whole backend

The backend is complete when a user can:

```text
Register / login
    ↓
Find a product
    ↓
Compare prices
    ↓
Create a shopping list
    ↓
Optimize where to buy
    ↓
Start shopping
    ↓
Record actual prices
    ↓
Finish the shopping session
    ↓
Contribute price observations
    ↓
Improve price intelligence
    ↓
Receive relevant price alerts
```

Each phase should leave the repository in a runnable state.
