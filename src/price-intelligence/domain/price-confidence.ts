import type { WeightedPrice } from './price-weighting.js';

/**
 * How much a derived price can be relied on, and how to say that to a person.
 */

export const PriceConfidenceLevel = {
  VeryRecent: 'VERY_RECENT',
  RecentlyVerified: 'RECENTLY_VERIFIED',
  LikelyCurrent: 'LIKELY_CURRENT',
  PossiblyOutdated: 'POSSIBLY_OUTDATED',
} as const;

export type PriceConfidenceLevel =
  (typeof PriceConfidenceLevel)[keyof typeof PriceConfidenceLevel];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Weight at which more evidence stops raising confidence. */
export const SATURATING_WEIGHT = 3;

/**
 * A 0..1 score over three signals: how fresh the newest contributing
 * observation is, how much evidence stands behind the price, and how much the
 * observations agree with each other.
 *
 * Kept internal. Clients get the level below, because a bare 0.62 invites a
 * reader to invent a meaning for it.
 */
export function confidenceScore(price: WeightedPrice, now: Date): number {
  const ageDays = Math.max(
    0,
    (now.getTime() - price.lastObservedAt.getTime()) / DAY_MS,
  );

  const recency = 0.5 ** (ageDays / 7);
  const volume = Math.min(1, price.totalWeight / SATURATING_WEIGHT);

  // Spread relative to the price itself: 50 cents apart means one thing on a
  // 1.25 item and another on a 40.00 one.
  const spread =
    price.priceCents > 0
      ? (price.maxPriceCents - price.minPriceCents) / price.priceCents
      : 1;
  const agreement = Math.max(0, 1 - Math.min(1, spread));

  const score = recency * 0.5 + volume * 0.3 + agreement * 0.2;

  return Math.min(1, Math.max(0, Number(score.toFixed(4))));
}

/**
 * Turns the score and the price's age into the four states the product shows.
 * Age dominates: a well-corroborated price from two months ago is still a
 * price from two months ago.
 */
export function confidenceLevel(
  score: number,
  lastObservedAt: Date,
  now: Date,
): PriceConfidenceLevel {
  const ageDays = (now.getTime() - lastObservedAt.getTime()) / DAY_MS;

  if (ageDays <= 1 && score >= 0.6) {
    return PriceConfidenceLevel.VeryRecent;
  }

  if (ageDays <= 7 && score >= 0.45) {
    return PriceConfidenceLevel.RecentlyVerified;
  }

  if (ageDays <= 30) {
    return PriceConfidenceLevel.LikelyCurrent;
  }

  return PriceConfidenceLevel.PossiblyOutdated;
}
