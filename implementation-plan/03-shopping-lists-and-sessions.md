# Phase 3 — Shopping Lists and Shopping Sessions

## Objective

Implement the core user workflow that connects planning at home with real-world shopping.

## 1. Shopping lists

Implement:

- create list;
- rename list;
- delete list;
- add item;
- remove item;
- change quantity;
- reorder/sort;
- duplicate list;
- list preferences.

Resources:

```text
POST   /shopping-lists
GET    /shopping-lists
GET    /shopping-lists/:id
PATCH  /shopping-lists/:id
DELETE /shopping-lists/:id

POST   /shopping-lists/:id/items
PATCH  /shopping-lists/:id/items/:itemId
DELETE /shopping-lists/:id/items/:itemId
```

## 2. List item model

A list item should conceptually contain:

```text
product
quantity
notes
expected price
purchased state
actual price
selected store
```

Do not make the client authoritative for financial totals.

## 3. Shopping sessions

Implement:

```text
start session
record item progress
record actual price
mark purchased
pause/continue
finish session
```

The shopping session connects a shopping list to a real shopping trip.

## 4. Running total

The backend must be able to calculate:

```text
Expected total
Actual total
Remaining expected total
```

Actual purchase prices override expected prices for completed items.

## 5. Offline-friendly API behavior

The domain must tolerate repeated submissions because the mobile client may retry after temporary connectivity loss.

Mutation endpoints should support idempotency where duplicate requests are realistically possible.

## 6. Domain event

Emit:

```text
ShoppingSessionStarted
ShoppingSessionCompleted
```

`ShoppingSessionCompleted` will later trigger price-intelligence and analytics consequences.

## 7. Database ownership

`core_db` owns:

```text
ShoppingList
ShoppingListItem
ShoppingSession
Purchase
```

Do not write price intelligence here.

## Agent acceptance criteria

- user can create and modify lists;
- user can start a session from a list;
- user can record an actual price;
- running totals are correct;
- session completion is safe to retry;
- unauthorized list/session access is impossible;
- tests cover quantities, totals, and session state transitions.

## Deliverable

A complete planning-to-shopping backend flow, without crowdsourced price processing yet.
