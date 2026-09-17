import type { DomainEvent } from './domain-event.js';

/**
 * The documented catalog of business facts the system publishes, with the
 * phase that starts emitting each one. A name lands here only when a real
 * business consequence exists (or is planned in a named phase) — this is not
 * a log of every write.
 *
 * | Event                    | Publisher          | Consumers            |
 * | ------------------------ | ------------------ | -------------------- |
 * | UserCreated              | auth (phase 1)     | notifications (ph. 8)|
 * | ShoppingListCreated      | shopping-lists (3) | —                    |
 * | ShoppingListItemAdded    | shopping-lists (3) | price-intelligence(5)|
 * | ShoppingSessionStarted   | shopping-sessions (3) | —                 |
 * | ShoppingSessionCompleted | shopping-sessions (3) | pricing (4), analytics |
 * | PriceObservationCreated  | pricing (4)        | price-intelligence(5)|
 * | PriceObservationAccepted | pricing (4)        | price-intelligence(5)|
 * | PriceObservationRejected | pricing (4)        | abuse review         |
 * | OptimizationRequested    | optimization (7)   | optimization worker  |
 */
export const DomainEventName = {
  UserCreated: 'UserCreated',
  ShoppingListCreated: 'ShoppingListCreated',
  ShoppingListItemAdded: 'ShoppingListItemAdded',
  ShoppingSessionStarted: 'ShoppingSessionStarted',
  ShoppingSessionCompleted: 'ShoppingSessionCompleted',
  PriceObservationCreated: 'PriceObservationCreated',
  PriceObservationAccepted: 'PriceObservationAccepted',
  PriceObservationRejected: 'PriceObservationRejected',
  OptimizationRequested: 'OptimizationRequested',
} as const;

export type DomainEventName =
  (typeof DomainEventName)[keyof typeof DomainEventName];

export interface UserCreatedPayload {
  userId: string;
  email: string;
}

export type UserCreatedEvent = DomainEvent<'UserCreated', UserCreatedPayload>;

export interface ShoppingListCreatedPayload {
  listId: string;
  ownerId: string;
  /** Set when the list was created by duplicating another one. */
  duplicatedFromListId: string | null;
}

export type ShoppingListCreatedEvent = DomainEvent<
  'ShoppingListCreated',
  ShoppingListCreatedPayload
>;

export interface ShoppingListItemAddedPayload {
  listId: string;
  itemId: string;
  ownerId: string;
  productId: string;
}

export type ShoppingListItemAddedEvent = DomainEvent<
  'ShoppingListItemAdded',
  ShoppingListItemAddedPayload
>;

export interface ShoppingSessionStartedPayload {
  sessionId: string;
  ownerId: string;
  listId: string;
  storeId: string | null;
}

export type ShoppingSessionStartedEvent = DomainEvent<
  'ShoppingSessionStarted',
  ShoppingSessionStartedPayload
>;

/** One purchased line of a completed trip. */
export interface CompletedPurchase {
  productId: string;
  storeId: string | null;
  quantity: number;
  /** Null when the shopper confirmed the expected price without typing one. */
  actualUnitPriceCents: number | null;
  expectedUnitPriceCents: number | null;
  purchasedAt: string;
}

/**
 * The trip is over and these are the things actually bought. Phase 4 turns the
 * lines carrying an actual price into price observations — the preferred
 * crowdsourcing path, because each is tied to a genuine purchase.
 *
 * Published once per trip: a retried completion is a replay and publishes
 * nothing. The bus is in-process, so a crash between commit and publish loses
 * the event. Contributions does not rely on it alone: a reconciliation sweep
 * finds completed trips with no contribution recorded and processes them.
 */
export interface ShoppingSessionCompletedPayload {
  sessionId: string;
  ownerId: string;
  storeId: string | null;
  currency: string;
  completedAt: string;
  purchases: CompletedPurchase[];
}

export type ShoppingSessionCompletedEvent = DomainEvent<
  'ShoppingSessionCompleted',
  ShoppingSessionCompletedPayload
>;

/** What every observation event carries. Review reasons stay internal to pricing. */
export interface PriceObservationPayload {
  observationId: string;
  productId: string;
  storeId: string;
  priceCents: number;
  currency: string;
  observedAt: string;
  sourceType: 'USER_REPORTED' | 'USER_WITH_EVIDENCE' | 'PURCHASE_CONFIRMED' | 'EXTERNAL_API';
  status: 'ACCEPTED' | 'FLAGGED' | 'REJECTED';
  userId: string | null;
}

/** An observation was stored, whatever trust evaluation decided about it. */
export type PriceObservationCreatedEvent = DomainEvent<
  'PriceObservationCreated',
  PriceObservationPayload
>;

/** An observation may now shape derived prices. */
export type PriceObservationAcceptedEvent = DomainEvent<
  'PriceObservationAccepted',
  PriceObservationPayload
>;

/** An observation was kept for abuse analysis but will never be used as a price. */
export type PriceObservationRejectedEvent = DomainEvent<
  'PriceObservationRejected',
  PriceObservationPayload
>;
