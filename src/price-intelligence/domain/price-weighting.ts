import type {
  PriceObservationStatus,
  PriceSourceType,
} from '../../pricing/domain/price-observation.entity.js';

/**
 * How much each observation counts toward a derived price.
 *
 * The formula lives here, behind one function, because it will change: the
 * signals it uses (source, recency, corroboration) are business judgements,
 * not arithmetic, and every caller should get the new judgement at once.
 */

export interface WeightedObservation {
  priceCents: number;
  observedAt: Date;
  sourceType: PriceSourceType;
  status: PriceObservationStatus;
  userId: string | null;
}

/**
 * Trust in the source. A price that was actually paid, or that a supermarket
 * published, says more than one typed from memory.
 */
export const SOURCE_WEIGHT: Record<PriceSourceType, number> = {
  EXTERNAL_API: 1,
  PURCHASE_CONFIRMED: 1,
  USER_WITH_EVIDENCE: 0.8,
  USER_REPORTED: 0.5,
};

/** Days over which an observation loses half its weight. */
export const RECENCY_HALF_LIFE_DAYS = 7;

/** An old observation keeps a little weight: some price beats no price. */
export const MIN_RECENCY_WEIGHT = 0.05;

/**
 * A flagged observation that survived corroboration still counts for less
 * than one that was never in doubt.
 */
export const FLAGGED_PENALTY = 0.3;

const DAY_MS = 24 * 60 * 60 * 1000;

export function recencyWeight(observedAt: Date, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - observedAt.getTime()) / DAY_MS);
  return Math.max(
    MIN_RECENCY_WEIGHT,
    0.5 ** (ageDays / RECENCY_HALF_LIFE_DAYS),
  );
}

export function weightOf(observation: WeightedObservation, now: Date): number {
  const penalty = observation.status === 'FLAGGED' ? FLAGGED_PENALTY : 1;
  return (
    SOURCE_WEIGHT[observation.sourceType] *
    recencyWeight(observation.observedAt, now) *
    penalty
  );
}

export interface WeightedPrice {
  priceCents: number;
  minPriceCents: number;
  maxPriceCents: number;
  /** Sum of the weights behind it — how much evidence this price rests on. */
  totalWeight: number;
  observationCount: number;
  lastObservedAt: Date;
}

/**
 * The weighted mean, not the newest price and not a plain average: one loud
 * contributor cannot move it the way overwriting would, and a stale price
 * fades instead of counting forever.
 */
export function weightedPrice(
  observations: WeightedObservation[],
  now: Date,
): WeightedPrice | null {
  if (observations.length === 0) {
    return null;
  }

  let weightedSum = 0;
  let totalWeight = 0;
  let minPriceCents = Number.POSITIVE_INFINITY;
  let maxPriceCents = 0;
  let lastObservedAt = new Date(0);

  for (const observation of observations) {
    const weight = weightOf(observation, now);

    weightedSum += observation.priceCents * weight;
    totalWeight += weight;
    minPriceCents = Math.min(minPriceCents, observation.priceCents);
    maxPriceCents = Math.max(maxPriceCents, observation.priceCents);

    if (observation.observedAt > lastObservedAt) {
      lastObservedAt = observation.observedAt;
    }
  }

  return {
    priceCents: Math.round(weightedSum / totalWeight),
    minPriceCents,
    maxPriceCents,
    totalWeight,
    observationCount: observations.length,
    lastObservedAt,
  };
}
