import { lineTotalCents } from '../../shopping-lists/domain/money.js';

export const ShoppingSessionStatus = {
  Active: 'ACTIVE',
  Paused: 'PAUSED',
  Completed: 'COMPLETED',
  Abandoned: 'ABANDONED',
} as const;

export type ShoppingSessionStatus =
  (typeof ShoppingSessionStatus)[keyof typeof ShoppingSessionStatus];

/** One line of a trip — a Purchase, once `isPurchased` is set. */
export interface ShoppingSessionItem {
  id: string;
  sessionId: string;
  sourceListItemId: string | null;
  productId: string;
  quantity: number;
  notes: string | null;
  expectedUnitPriceCents: number | null;
  actualUnitPriceCents: number | null;
  storeId: string | null;
  isPurchased: boolean;
  purchasedAt: Date | null;
  position: number;
}

export interface ShoppingSession {
  id: string;
  ownerId: string;
  /** Null once the list the trip started from has been deleted. */
  listId: string | null;
  listName: string;
  currency: string;
  storeId: string | null;
  status: ShoppingSessionStatus;
  startedAt: Date;
  pausedAt: Date | null;
  completedAt: Date | null;
  abandonedAt: Date | null;
  items: ShoppingSessionItem[];
  createdAt: Date;
  updatedAt: Date;
}

/** A session still in progress, which is the only kind that accepts changes. */
export function isOpen(status: ShoppingSessionStatus): boolean {
  return status === 'ACTIVE' || status === 'PAUSED';
}

export type SessionAction = 'pause' | 'resume' | 'complete' | 'abandon';

const TARGET: Record<SessionAction, ShoppingSessionStatus> = {
  pause: 'PAUSED',
  resume: 'ACTIVE',
  complete: 'COMPLETED',
  abandon: 'ABANDONED',
};

/** Where each action may start from, besides its own target state. */
const ALLOWED_FROM: Record<SessionAction, ShoppingSessionStatus[]> = {
  pause: ['ACTIVE'],
  resume: ['PAUSED'],
  complete: ['ACTIVE', 'PAUSED'],
  abandon: ['ACTIVE', 'PAUSED'],
};

export type TransitionOutcome =
  /** The status changes; persist it and publish whatever follows. */
  | { kind: 'transition'; to: ShoppingSessionStatus }
  /** Already in the target state: a retried request. Succeed, change nothing. */
  | { kind: 'replay' }
  /** Not reachable from here, e.g. completing an abandoned trip. */
  | { kind: 'rejected'; reason: string };

/**
 * The session state machine.
 *
 * Every action is safe to repeat. A phone that loses signal after tapping
 * "Finish" retries, and the retry has to succeed without completing the trip a
 * second time — so reaching the state you are already in is a replay, not an
 * error. Only a genuinely contradictory move (resuming a completed trip) is
 * rejected.
 */
export function decideTransition(
  current: ShoppingSessionStatus,
  action: SessionAction,
): TransitionOutcome {
  const target = TARGET[action];

  if (current === target) {
    return { kind: 'replay' };
  }

  if (ALLOWED_FROM[action].includes(current)) {
    return { kind: 'transition', to: target };
  }

  return {
    kind: 'rejected',
    reason: `Cannot ${action} a session that is ${current.toLowerCase()}`,
  };
}

export interface SessionTotals {
  /** Every planned line at its expected price: what the trip was meant to cost. */
  expectedTotalCents: number;
  /** Purchased lines, at the price actually paid where one was recorded. */
  actualTotalCents: number;
  /** Lines not yet purchased, at their expected price. */
  remainingExpectedTotalCents: number;
  /** Spent so far plus what is left: the running estimate for the whole trip. */
  projectedTotalCents: number;
  itemCount: number;
  purchasedItemCount: number;
  /** Lines contributing nothing because no price, expected or actual, is known. */
  unpricedItemCount: number;
}

/**
 * The running total of a trip, always computed on the server from stored
 * lines. The client never supplies a total.
 *
 * A purchased line is counted at its actual price when one was recorded and at
 * its expected price otherwise: a shopper who confirms "yes, it was the price
 * I expected" should not have to type it in again.
 */
export function calculateSessionTotals(
  items: Pick<
    ShoppingSessionItem,
    'quantity' | 'expectedUnitPriceCents' | 'actualUnitPriceCents' | 'isPurchased'
  >[],
): SessionTotals {
  const totals: SessionTotals = {
    expectedTotalCents: 0,
    actualTotalCents: 0,
    remainingExpectedTotalCents: 0,
    projectedTotalCents: 0,
    itemCount: items.length,
    purchasedItemCount: 0,
    unpricedItemCount: 0,
  };

  for (const item of items) {
    const expected =
      item.expectedUnitPriceCents === null
        ? null
        : lineTotalCents(item.quantity, item.expectedUnitPriceCents);

    if (expected !== null) {
      totals.expectedTotalCents += expected;
    }

    if (item.isPurchased) {
      totals.purchasedItemCount += 1;

      const paidUnitPrice =
        item.actualUnitPriceCents ?? item.expectedUnitPriceCents;

      if (paidUnitPrice === null) {
        totals.unpricedItemCount += 1;
      } else {
        totals.actualTotalCents += lineTotalCents(item.quantity, paidUnitPrice);
      }

      continue;
    }

    if (expected === null) {
      totals.unpricedItemCount += 1;
    } else {
      totals.remainingExpectedTotalCents += expected;
    }
  }

  totals.projectedTotalCents =
    totals.actualTotalCents + totals.remainingExpectedTotalCents;

  return totals;
}

/** How far into the future a client clock may be before a timestamp is refused. */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Resolves when an item was purchased. An offline client reports the moment the
 * shopper tapped, which may be well before the request arrives; that is kept.
 * A time before the trip began, or meaningfully in the future, is a broken
 * clock and falls back to now rather than corrupting purchase history.
 */
export function resolvePurchasedAt(
  reported: Date | undefined,
  sessionStartedAt: Date,
  now: Date,
): Date {
  if (!reported || Number.isNaN(reported.getTime())) {
    return now;
  }

  const tooEarly = reported.getTime() < sessionStartedAt.getTime();
  const tooLate = reported.getTime() > now.getTime() + CLOCK_SKEW_TOLERANCE_MS;

  return tooEarly || tooLate ? now : reported;
}
