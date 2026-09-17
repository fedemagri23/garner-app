/**
 * Money and quantity arithmetic for shopping.
 *
 * Prices are integer minor units (cents) and quantities have at most three
 * decimals, so every calculation here is done in integers — cents times
 * thousandths of a unit — and rounded exactly once per line. Floating-point
 * sums of prices drift by a cent over a long list, and a total the shopper can
 * check by hand has to add up.
 */

/** Quantities are stored with three decimals: 1.5 kg, 0.25 kg, 12 units. */
export const QUANTITY_SCALE = 1000;

export const MAX_QUANTITY = 9999;

/** Quantity as an integer count of thousandths, so 1.5 becomes 1500. */
export function toQuantityMillis(quantity: number): number {
  return Math.round(quantity * QUANTITY_SCALE);
}

/** A quantity is positive, bounded, and has no more than three decimals. */
export function isValidQuantity(quantity: number): boolean {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
    return false;
  }

  // Compare against the rounded thousandths with a tolerance, since 0.001
  // itself is not exactly representable in binary.
  const millis = quantity * QUANTITY_SCALE;
  return Math.abs(millis - Math.round(millis)) < 1e-6;
}

/** A unit price is a non-negative whole number of cents. Zero is a free item. */
export function isValidPriceCents(cents: number): boolean {
  return Number.isSafeInteger(cents) && cents >= 0;
}

/**
 * Line total in cents for `quantity` units at `unitPriceCents` each, rounded
 * half away from zero — the rounding a till applies.
 */
export function lineTotalCents(quantity: number, unitPriceCents: number): number {
  const exact = toQuantityMillis(quantity) * unitPriceCents;
  return Math.floor((exact + QUANTITY_SCALE / 2) / QUANTITY_SCALE);
}

/** ISO 4217 codes are three upper-case letters. */
export function isCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}
