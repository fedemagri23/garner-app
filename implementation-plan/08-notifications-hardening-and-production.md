# Phase 8 — Notifications, Hardening, and Production Readiness

## Objective

Complete the core backend experience and harden it for real-world use.

## 1. Notifications

Implement price alerts.

Example:

```text
product
store/area
threshold
enabled
```

Triggers may include:

- price below threshold;
- significant price drop;
- product becomes cheaper nearby;
- shopping reminder.

Flow:

```text
Price intelligence changes
       ↓
Evaluate active alerts
       ↓
PriceAlertTriggered
       ↓
Notification worker
       ↓
Delivery provider
```

## 2. Notification preferences

Users should control:

- enabled/disabled notifications;
- alert frequency;
- quiet periods where relevant;
- notification categories.

## 3. Observability

Implement:

### Logging

Structured logs with:

- request ID;
- user/account reference where appropriate;
- job ID;
- event name;
- severity.

### Metrics

Track:

- API latency;
- error rates;
- queue depth;
- job failure/retry counts;
- database latency;
- external source import success;
- price-observation rejection rate.

### Tracing

Add distributed tracing hooks so that later extraction into services remains observable.

## 4. Health checks

Check:

```text
API
core_db
pricing_db
intelligence_db
Redis
queue/worker health
```

## 5. Reliability hardening

Verify:

- retry behavior;
- idempotent jobs;
- idempotent external imports;
- database transaction boundaries;
- cache invalidation;
- graceful shutdown;
- timeouts for external APIs.

## 6. Security review

Review:

- authentication;
- authorization;
- ownership checks;
- rate limits;
- abuse detection;
- input validation;
- secret management;
- audit logging;
- sensitive error messages.

## 7. Data-retention jobs

Implement scheduled maintenance for:

- expired raw observations;
- temporary queue data;
- stale caches;
- old temporary records.

Daily historical price data remains long-lived.

## 8. Backup/recovery expectations

Define recovery procedures for:

- `core_db`;
- `pricing_db`;
- `intelligence_db`.

Because intelligence is derived data, establish a documented rebuild procedure.

## 9. Performance verification

Test realistic workloads:

- product search;
- product price comparison;
- list retrieval;
- list modification;
- price submission;
- daily import;
- intelligence aggregation;
- optimization.

Identify queries requiring indexes before introducing more infrastructure.

## 10. Production readiness criteria

The backend is ready when:

- core user journey works end-to-end;
- errors are observable;
- critical jobs retry safely;
- external source failures are isolated;
- data ownership is enforced;
- price manipulation protections are active;
- historical data is compact;
- Redis failure does not corrupt business data;
- derived intelligence can be rebuilt;
- Docker-based deployment is reproducible.

## Future scaling, not Phase 8 requirements

Do not introduce yet unless actual load requires it:

- multiple API instances;
- read replicas;
- separate PostgreSQL clusters;
- microservices;
- Kafka;
- Kubernetes.

The current architecture must simply make those future changes possible.
