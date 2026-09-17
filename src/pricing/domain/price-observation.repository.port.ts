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

/**
 * The pricing module's data contract over `pricing_db`. Price intelligence
 * (phase 5) reads observations through it; contributions reads a user's own.
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
  /** Deletes up to `limit` observations received before `cutoff`; returns how many. */
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
