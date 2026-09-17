import { PriceSourceType } from './price-observation.entity.js';

/**
 * Hard bounds on what can be a price at all. These reject input outright
 * (nothing is stored), unlike the trust rules, which store and flag.
 */

/** Well above any grocery item, well below Postgres `integer`. */
export const MAX_PRICE_CENTS = 100_000_000;

/** How far ahead of the server clock a device clock may run. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How old a price may be when it arrives. A shelf price reported a week later
 * says little about today; a purchase can legitimately sync later, since a trip
 * may sit paused for days before it is completed.
 */
export const MAX_OBSERVATION_AGE_MS: Record<PriceSourceType, number> = {
  USER_REPORTED: 7 * DAY_MS,
  USER_WITH_EVIDENCE: 7 * DAY_MS,
  PURCHASE_CONFIRMED: 30 * DAY_MS,
  EXTERNAL_API: 7 * DAY_MS,
};

export type PlausibilityProblem =
  | 'PRICE_NOT_POSITIVE_INTEGER'
  | 'PRICE_TOO_HIGH'
  | 'CURRENCY_INVALID'
  | 'OBSERVED_IN_FUTURE'
  | 'OBSERVED_TOO_LONG_AGO';

export function checkPlausibility(
  input: {
    priceCents: number;
    currency: string;
    observedAt: Date;
    sourceType: PriceSourceType;
  },
  now: Date,
): PlausibilityProblem | null {
  // A price of zero is not an observation of a price.
  if (!Number.isSafeInteger(input.priceCents) || input.priceCents <= 0) {
    return 'PRICE_NOT_POSITIVE_INTEGER';
  }

  if (input.priceCents > MAX_PRICE_CENTS) {
    return 'PRICE_TOO_HIGH';
  }

  if (!/^[A-Z]{3}$/.test(input.currency)) {
    return 'CURRENCY_INVALID';
  }

  const observed = input.observedAt.getTime();

  if (Number.isNaN(observed) || observed > now.getTime() + MAX_CLOCK_SKEW_MS) {
    return 'OBSERVED_IN_FUTURE';
  }

  if (now.getTime() - observed > MAX_OBSERVATION_AGE_MS[input.sourceType]) {
    return 'OBSERVED_TOO_LONG_AGO';
  }

  return null;
}

export const PLAUSIBILITY_MESSAGES: Record<PlausibilityProblem, string> = {
  PRICE_NOT_POSITIVE_INTEGER: 'priceCents must be a positive whole number of cents',
  PRICE_TOO_HIGH: 'priceCents is higher than any plausible price',
  CURRENCY_INVALID: 'currency must be an ISO 4217 code',
  OBSERVED_IN_FUTURE: 'observedAt cannot be in the future',
  OBSERVED_TOO_LONG_AGO: 'observedAt is too old to describe a current price',
};
