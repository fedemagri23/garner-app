# Phase 2 — Identity, Security, and Catalog

## Objective

Implement the identity layer and the product/store catalog that every later domain depends on.

## 1. Identity

Implement:

- registration;
- login;
- logout/session invalidation;
- refresh tokens;
- current-user endpoint;
- basic user profile;
- user preferences;
- location preferences.

High-level resources:

```text
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET  /users/me
PATCH /users/me
```

## 2. Authorization

Establish ownership rules for user-owned resources.

A user must only be able to access:

- their shopping lists;
- their shopping sessions;
- their alerts;
- their contribution history;
- their preferences.

## 3. Security controls

Implement generic controls now:

- per-IP rate limiting;
- authenticated-user rate limiting;
- request validation;
- authentication brute-force protection;
- security logging.

Do not yet implement sophisticated contribution reputation; that belongs to pricing.

## 4. Product catalog

Implement canonical:

```text
Product
Brand
Category
Barcode
ProductVariant / Unit
```

Important business rule:

A product identity must be stable even though prices change.

The product catalog must support product matching later when external supermarket data is imported.

## 5. Supermarkets

Implement:

```text
Supermarket
StoreLocation
StoreMetadata
OpeningHours
```

A supermarket is the chain/merchant.

A store location is a physical place.

## 6. Product lookup

Support:

- text search;
- category browsing;
- barcode lookup;
- product detail.

Expected query:

```text
GET /products
GET /products/:id
GET /products/barcode/:barcode
```

## 7. Database ownership

`core_db` owns:

- users;
- auth metadata;
- products;
- categories;
- brands;
- barcodes;
- supermarkets;
- store locations;
- user preferences.

## Agent acceptance criteria

- authentication works end-to-end;
- ownership checks are enforced;
- product search works;
- barcode lookup works;
- supermarket/store catalog works;
- indexes exist for primary search paths;
- tests cover authorization and product identity rules.

## Deliverable

A secure backend capable of identifying users, products, and stores.
