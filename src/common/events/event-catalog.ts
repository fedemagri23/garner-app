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
 * | OptimizationRequested    | optimization (7)   | optimization worker  |
 */
export const DomainEventName = {
  UserCreated: 'UserCreated',
  ShoppingListCreated: 'ShoppingListCreated',
  ShoppingListItemAdded: 'ShoppingListItemAdded',
  ShoppingSessionStarted: 'ShoppingSessionStarted',
  ShoppingSessionCompleted: 'ShoppingSessionCompleted',
  PriceObservationCreated: 'PriceObservationCreated',
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
 * the event; phase 4 must decide whether that warrants an outbox.
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
