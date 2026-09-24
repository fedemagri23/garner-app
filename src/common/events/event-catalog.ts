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
 * | DerivedPriceUpdated      | price-intelligence(5) | notifications (8) |
 * | DailyPriceCalculated     | price-intelligence(5) | analytics         |
 * | PriceAnomalyDetected     | price-intelligence(5) | abuse review      |
 * | ExternalPriceImportStarted   | external-price-sources(6) | —           |
 * | ExternalPriceImportCompleted | external-price-sources(6) | monitoring  |
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
  DerivedPriceUpdated: 'DerivedPriceUpdated',
  DailyPriceCalculated: 'DailyPriceCalculated',
  PriceAnomalyDetected: 'PriceAnomalyDetected',
  ExternalPriceImportStarted: 'ExternalPriceImportStarted',
  ExternalPriceImportCompleted: 'ExternalPriceImportCompleted',
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

/**
 * A product's current price at a store was recomputed and changed. Phase 8
 * turns a fall past a shopper's threshold into a price alert.
 */
export interface DerivedPriceUpdatedPayload {
  productId: string;
  storeId: string;
  currency: string;
  priceCents: number;
  /** Null the first time a price is derived for this product and store. */
  previousPriceCents: number | null;
  confidenceLevel:
    | 'VERY_RECENT'
    | 'RECENTLY_VERIFIED'
    | 'LIKELY_CURRENT'
    | 'POSSIBLY_OUTDATED';
}

export type DerivedPriceUpdatedEvent = DomainEvent<
  'DerivedPriceUpdated',
  DerivedPriceUpdatedPayload
>;

/** A day of observations was aggregated into the long-lived history. */
export interface DailyPriceCalculatedPayload {
  productId: string;
  storeId: string;
  /** UTC calendar day, as `YYYY-MM-DD`. */
  date: string;
  weightedAverageCents: number;
  observationCount: number;
  confidence: number;
}

export type DailyPriceCalculatedEvent = DomainEvent<
  'DailyPriceCalculated',
  DailyPriceCalculatedPayload
>;

/** A day's average moved sharply against the day before it. */
export interface PriceAnomalyDetectedPayload {
  productId: string;
  storeId: string;
  date: string;
  previousAverageCents: number;
  currentAverageCents: number;
}

export type PriceAnomalyDetectedEvent = DomainEvent<
  'PriceAnomalyDetected',
  PriceAnomalyDetectedPayload
>;

export interface ExternalPriceImportStartedPayload {
  sourceId: string;
  sourceSlug: string;
  runId: string;
  runKey: string;
}

export type ExternalPriceImportStartedEvent = DomainEvent<
  'ExternalPriceImportStarted',
  ExternalPriceImportStartedPayload
>;

/**
 * One source's import finished. PARTIAL means the source answered but some of
 * what it sent could not be used — unmatched products, prices for unmapped
 * stores — which is expected and is the operator's queue, not an incident.
 */
export interface ExternalPriceImportCompletedPayload {
  sourceId: string;
  sourceSlug: string;
  runId: string;
  runKey: string;
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
  observationsCreated: number;
  unmatchedProducts: number;
  skippedPrices: number;
  error: string | null;
}

export type ExternalPriceImportCompletedEvent = DomainEvent<
  'ExternalPriceImportCompleted',
  ExternalPriceImportCompletedPayload
>;
