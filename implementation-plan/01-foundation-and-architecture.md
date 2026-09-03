# Phase 1 — Foundation and Architecture

## Objective

Create the backend skeleton and enforce the architectural boundaries before implementing product functionality.

## Scope

### Project setup

Create:

```text
NestJS
TypeScript
Prisma
Jest
Docker Compose
OpenAPI / Swagger
```

Establish the initial repository structure:

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

Inside each domain:

```text
domain/
application/
infrastructure/
presentation/
```

## Databases

Configure three logical PostgreSQL databases:

```text
core_db
pricing_db
intelligence_db
```

Do not create cross-database foreign keys.

## Shared infrastructure

Configure:

- PostgreSQL
- Redis
- BullMQ
- application configuration
- logging
- graceful startup/shutdown
- health endpoint

## API conventions

Establish:

- global validation;
- consistent error format;
- API versioning strategy;
- pagination convention;
- OpenAPI metadata;
- request IDs.

## Security baseline

Implement the foundation for:

- JWT access tokens;
- refresh-token strategy;
- password hashing;
- authorization guards;
- rate limiting;
- secure headers;
- ownership checks.

Business-specific anti-price-manipulation rules belong to Phase 4.

## Events

Create a domain-event abstraction without requiring a distributed event broker.

Initial events:

```text
UserCreated
ShoppingListCreated
ShoppingListItemAdded
ShoppingSessionStarted
PriceObservationCreated
OptimizationRequested
```

Only add an event when a real business consequence exists.

## Testing

Set up:

- unit tests;
- integration-test support;
- test database strategy;
- fixture/factory conventions.

## Agent acceptance criteria

The agent must prove:

- application starts;
- all three databases are reachable;
- Redis is reachable;
- BullMQ can enqueue and process a test job;
- authenticated and unauthenticated routes behave correctly;
- OpenAPI is generated;
- tests run successfully;
- no module depends directly on another module's infrastructure.

## Deliverable

A runnable empty-but-architecturally-correct backend.
