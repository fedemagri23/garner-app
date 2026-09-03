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
 * | PriceObservationCreated  | pricing (4)        | price-intelligence(5)|
 * | OptimizationRequested    | optimization (7)   | optimization worker  |
 */
export const DomainEventName = {
  UserCreated: 'UserCreated',
  ShoppingListCreated: 'ShoppingListCreated',
  ShoppingListItemAdded: 'ShoppingListItemAdded',
  ShoppingSessionStarted: 'ShoppingSessionStarted',
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
