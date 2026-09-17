/**
 * How far a submitted price sits from what has recently been seen.
 *
 * The reference is the median of recent accepted prices rather than the mean:
 * one earlier bad value that slipped through would drag a mean, and an
 * attacker could walk it step by step. A median only moves when most recent
 * observations move.
 */

export type DeviationLevel =
  /** Too few recent prices to judge. */
  | 'unknown'
  | 'consistent'
  | 'moderate'
  | 'extreme';

export interface DeviationThresholds {
  /** Fewest samples that make a median worth trusting. */
  minSamples: number;
  /** Ratio (either direction) from which a price is unusual. */
  moderateRatio: number;
  /** Ratio from which a price is very likely wrong. */
  extremeRatio: number;
}

/**
 * The same store should price an item consistently, so the store tier is
 * strict. Across stores prices legitimately differ more, so that fallback tier
 * is looser.
 */
export const SAME_STORE_THRESHOLDS: DeviationThresholds = {
  minSamples: 3,
  moderateRatio: 1.5,
  extremeRatio: 3,
};

export const ANY_STORE_THRESHOLDS: DeviationThresholds = {
  minSamples: 5,
  moderateRatio: 2,
  extremeRatio: 4,
};

export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function assessDeviation(
  priceCents: number,
  samples: number[],
  thresholds: DeviationThresholds,
): DeviationLevel {
  if (samples.length < thresholds.minSamples) {
    return 'unknown';
  }

  const reference = median(samples) as number;

  // Symmetric: a price at a third of the median is as suspicious as one at
  // three times it.
  const ratio = Math.max(priceCents / reference, reference / priceCents);

  if (ratio >= thresholds.extremeRatio) {
    return 'extreme';
  }

  if (ratio >= thresholds.moderateRatio) {
    return 'moderate';
  }

  return 'consistent';
}

/**
 * Judges against the same store when there is enough history there, and
 * falls back to the product across all stores otherwise.
 */
export function assessAgainstHistory(
  priceCents: number,
  sameStoreSamples: number[],
  anyStoreSamples: number[],
): DeviationLevel {
  const sameStore = assessDeviation(
    priceCents,
    sameStoreSamples,
    SAME_STORE_THRESHOLDS,
  );

  if (sameStore !== 'unknown') {
    return sameStore;
  }

  return assessDeviation(priceCents, anyStoreSamples, ANY_STORE_THRESHOLDS);
}
