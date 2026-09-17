import {
  isUserSubmitted,
  PriceObservationStatus,
  PriceSourceType,
  ReviewReason,
} from './price-observation.entity.js';
import type { DeviationLevel } from './price-deviation.js';

const HOUR_S = 60 * 60;
const DAY_S = 24 * HOUR_S;

/**
 * Hard limits on user-submitted prices. Exceeding one refuses the request with
 * 429 and stores nothing. They apply to people typing prices in; purchases are
 * bounded by the trip they came from and feeds by their own schedule.
 */
export const HARD_LIMITS = {
  perIp: { max: 60, windowSeconds: HOUR_S },
  perAccount: { max: 60, windowSeconds: HOUR_S },
  /** The same person reporting the same product at the same store. */
  perAccountTarget: { max: 5, windowSeconds: DAY_S },
} as const;

/**
 * Soft thresholds. Crossing one stores the observation but flags it, so
 * suspicious volume cannot shape a price — without letting an attacker who
 * floods one product lock honest shoppers out of reporting it.
 */
export const SOFT_LIMITS = {
  accountPerHour: 20,
  /** A third report of the same product at the same store within a day. */
  accountTargetPerDay: 3,
  productPerHour: 100,
  storePerHour: 500,
} as const;

export const WINDOWS = {
  hour: HOUR_S,
  day: DAY_S,
} as const;

/** Accounts younger than this have their reports held for confirmation. */
export const NEW_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;

/** Deviating reports within `lookback` beyond which a contributor is low-trust. */
export const REPEATED_DEVIATIONS = {
  threshold: 3,
  lookbackMs: 7 * 24 * 60 * 60 * 1000,
} as const;

/** Same person, product, store and price inside this window is one report sent twice. */
export const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

export interface TrustSignals {
  sourceType: PriceSourceType;
  /** Null when there is no account behind the observation (a feed). */
  accountAgeMs: number | null;
  deviation: DeviationLevel;
  /** Counts include this submission. */
  accountSubmissionsLastHour: number;
  accountTargetSubmissionsLastDay: number;
  productSubmissionsLastHour: number;
  storeSubmissionsLastHour: number;
  /** Earlier observations by this account flagged for deviating. */
  recentDeviationsByAccount: number;
}

export interface TrustDecision {
  status: PriceObservationStatus;
  reasons: ReviewReason[];
}

/**
 * Decides whether an observation may shape prices.
 *
 * Nothing a single submission does can move a public price by itself: phase 5
 * derives prices from ACCEPTED observations only, weighted by source, and a
 * FLAGGED one waits for independent confirmation. What this function decides
 * is how much benefit of the doubt a submission gets.
 *
 * A confirmed purchase gets the most: it was paid, so an unusual price is more
 * likely a real price than a lie, and only an extreme one is held back (as a
 * probable typo). A shelf report typed in by a person gets the least.
 */
export function decideTrust(signals: TrustSignals): TrustDecision {
  const rejectReasons: ReviewReason[] = [];
  const flagReasons: ReviewReason[] = [];
  const userSubmitted = isUserSubmitted(signals.sourceType);

  if (signals.deviation === 'extreme') {
    if (userSubmitted) {
      rejectReasons.push(ReviewReason.ExtremePriceDeviation);
    } else {
      flagReasons.push(ReviewReason.ExtremePriceDeviation);
    }
  }

  // Evidence and purchases vouch for a moderately unusual price; a bare
  // report does not.
  if (
    signals.deviation === 'moderate' &&
    signals.sourceType === PriceSourceType.UserReported
  ) {
    flagReasons.push(ReviewReason.PriceDeviation);
  }

  if (userSubmitted) {
    if (
      signals.accountAgeMs !== null &&
      signals.accountAgeMs < NEW_ACCOUNT_AGE_MS
    ) {
      flagReasons.push(ReviewReason.NewAccount);
    }

    if (
      signals.accountTargetSubmissionsLastDay >= SOFT_LIMITS.accountTargetPerDay
    ) {
      flagReasons.push(ReviewReason.RepeatedSubmission);
    }

    if (signals.accountSubmissionsLastHour > SOFT_LIMITS.accountPerHour) {
      flagReasons.push(ReviewReason.HighAccountVolume);
    }

    if (signals.productSubmissionsLastHour > SOFT_LIMITS.productPerHour) {
      flagReasons.push(ReviewReason.ProductVolumeSpike);
    }

    if (signals.storeSubmissionsLastHour > SOFT_LIMITS.storePerHour) {
      flagReasons.push(ReviewReason.StoreVolumeSpike);
    }

    if (signals.recentDeviationsByAccount >= REPEATED_DEVIATIONS.threshold) {
      flagReasons.push(ReviewReason.RepeatedDeviations);
    }
  }

  if (rejectReasons.length > 0) {
    return {
      status: PriceObservationStatus.Rejected,
      reasons: [...rejectReasons, ...flagReasons],
    };
  }

  if (flagReasons.length > 0) {
    return { status: PriceObservationStatus.Flagged, reasons: flagReasons };
  }

  return { status: PriceObservationStatus.Accepted, reasons: [] };
}
