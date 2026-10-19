import type {
  NewPriceObservation,
  PriceObservation,
  ReviewReason,
} from './price-observation.entity.js';

export interface PriceSampleQuery {
  productId: string;
  /** Omit to sample the product across every store. */
  storeId?: string;
  currency: string;
  since: Date;
  limit: number;
}

/** One product, store and currency that had observations in a period. */
export interface AggregationTarget {
  productId: string;
  storeId: string;
  currency: string;
}

/**
 * The pricing module's data contract over `pricing_db`. Price intelligence
 * reads observations through it to derive prices; contributions reads a
 * user's own.
 */
export interface PriceObservationRepository {
  findById(id: string): Promise<PriceObservation | null>;
  findByDedupeKey(dedupeKey: string): Promise<PriceObservation | null>;
  /** The same person reporting the same price again within a short window. */
  findRecentDuplicate(input: {
    userId: string;
    productId: string;
    storeId: string;
    priceCents: number;
    currency: string;
    since: Date;
  }): Promise<PriceObservation | null>;
  /** Prices of recent ACCEPTED observations, newest first. */
  recentAcceptedPrices(query: PriceSampleQuery): Promise<number[]>;
  countByUserWithReasonSince(
    userId: string,
    reasons: ReviewReason[],
    since: Date,
  ): Promise<number>;
  findByUser(
    userId: string,
    page: { skip: number; take: number },
  ): Promise<{ observations: PriceObservation[]; totalItems: number }>;
  /**
   * Inserts the observation. When its id or dedupe key already exists, returns
   * the existing row with `created: false` — a retry racing its original.
   */
  create(
    observation: NewPriceObservation,
  ): Promise<{ observation: PriceObservation; created: boolean }>;
  /**
   * For each product/store pair, the newest observation whose dedupe key
   * starts with `dedupeKeyPrefix` — the last thing one source said about it.
   * One query for the whole batch. Keyed by `productId:storeId`.
   */
  findLatestByDedupePrefix(
    dedupeKeyPrefix: string,
    pairs: { productId: string; storeId: string }[],
  ): Promise<Map<string, PriceObservation>>;
  /**
   * Records that each observation's price was seen again at its `at`. Never
   * moves a confirmation backwards, so an out-of-order retry is harmless.
   * Returns the ids actually confirmed — a row pruned meanwhile is not.
   */
  confirmMany(confirmations: { id: string; at: Date }[]): Promise<Set<string>>;
  /**
   * Observations whose price held at some point in a window — made in it, or
   * made before it and confirmed into it — whatever their status: the caller decides
   * which may shape a price, and needs to see the rejected ones to judge.
   */
  findInWindow(query: {
    productId: string;
    storeId: string;
    from: Date;
    to: Date;
    limit: number;
  }): Promise<PriceObservation[]>;
  /** Product/store pairs with a price held in a window, one page at a time. */
  listAggregationTargets(query: {
    from: Date;
    to: Date;
    skip: number;
    take: number;
  }): Promise<AggregationTarget[]>;
  /**
   * Deletes up to `limit` observations received before `cutoff` and not
   * confirmed since; returns how many.
   */
  deleteReceivedBefore(cutoff: Date, limit: number): Promise<number>;
}

export const PRICE_OBSERVATION_REPOSITORY = Symbol(
  'PRICE_OBSERVATION_REPOSITORY',
);

/**
 * Fixed-window counts of submissions by key, for rate limiting and volume signals.
 * Disposable state: losing it only resets the windows.
 */
export interface SubmissionCounter {
  /** Records one hit on each key and returns each key's count in its window. */
  hit(keys: { key: string; windowSeconds: number }[]): Promise<number[]>;
}

export const SUBMISSION_COUNTER = Symbol('SUBMISSION_COUNTER');
