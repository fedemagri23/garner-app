import type {
  ShoppingSession,
  ShoppingSessionStatus,
} from './shopping-session.entity.js';

export interface StartSessionInput {
  id?: string;
  ownerId: string;
  listId: string;
  listName: string;
  currency: string;
  storeId: string | null;
  items: {
    sourceListItemId: string;
    productId: string;
    quantity: number;
    notes: string | null;
    expectedUnitPriceCents: number | null;
    storeId: string | null;
    position: number;
  }[];
}

export interface UpdateSessionItemInput {
  quantity?: number;
  actualUnitPriceCents?: number | null;
  isPurchased?: boolean;
  purchasedAt?: Date | null;
}

export interface StatusChange {
  status: ShoppingSessionStatus;
  pausedAt?: Date | null;
  completedAt?: Date;
  abandonedAt?: Date;
}

export interface ShoppingSessionRepository {
  findById(id: string): Promise<ShoppingSession | null>;
  /** Ids of trips completed inside the window, oldest first. */
  findCompletedIdsBetween(from: Date, to: Date, limit: number): Promise<string[]>;
  findByOwner(
    ownerId: string,
    filter: { status?: ShoppingSessionStatus; skip: number; take: number },
  ): Promise<{ sessions: ShoppingSession[]; totalItems: number }>;
  /**
   * Creates the session with its copied lines. Returns the existing session
   * instead when `id` is already taken, or when the list already has a trip
   * in progress.
   */
  start(
    input: StartSessionInput,
  ): Promise<{ session: ShoppingSession; created: boolean }>;
  /**
   * Writes an item only while its session is still open, under the session's
   * row lock. Returns false when the session closed first.
   */
  updateItemWhileOpen(
    sessionId: string,
    itemId: string,
    input: UpdateSessionItemInput,
  ): Promise<boolean>;
  /**
   * Applies a status change only if the session is still in `expected`, under
   * the same row lock item writes take. Returns the session as it stands after
   * the change, or null when another request changed the status first — so two
   * concurrent "finish" taps cannot both complete, and both publish, one trip.
   */
  changeStatus(
    id: string,
    expected: ShoppingSessionStatus,
    change: StatusChange,
  ): Promise<ShoppingSession | null>;
}

export const SHOPPING_SESSION_REPOSITORY = Symbol(
  'SHOPPING_SESSION_REPOSITORY',
);
