/** How long a fall counts as news. */
export const PRICE_DROP_WINDOW_DAYS = 7;

/**
 * Smaller falls are left out of "bajó": a weighted price drifts by a peso or
 * two as observations age, and that is noise, not a bargain.
 */
export const MIN_DROP_PERCENT = 3;

const DAY = 24 * 60 * 60 * 1000;

/** A recent fall in the current price of one product at one store. */
export interface PriceDrop {
  productId: string;
  storeId: string;
  currency: string;
  priceCents: number;
  /** The price before the drop began. */
  previousPriceCents: number;
  droppedAt: Date;
}

export interface PriceChange {
  productId: string;
  storeId: string;
  currency: string;
  /** Null when the product had no current price at this store before. */
  fromCents: number | null;
  /** Null when the current price was removed. */
  toCents: number | null;
}

/**
 * The drop a price change leaves behind, if any.
 *
 * Falls inside the window merge: 1.500 → 1.450 → 1.390 is one drop from
 * 1.500, not two small ones. A rise keeps the drop while the price is still
 * under where it started, and ends it once it is back there.
 */
export function nextPriceDrop(
  current: PriceDrop | null,
  change: PriceChange,
  now: Date,
): PriceDrop | null {
  const { fromCents, toCents } = change;

  // A first price has nothing to have dropped from; a removed one nothing to
  // be dropped to.
  if (fromCents === null || toCents === null) {
    return null;
  }

  const live =
    current && isRecent(current, now) && current.currency === change.currency
      ? current
      : null;

  if (toCents < fromCents) {
    return {
      productId: change.productId,
      storeId: change.storeId,
      currency: change.currency,
      priceCents: toCents,
      previousPriceCents: Math.max(live?.previousPriceCents ?? 0, fromCents),
      droppedAt: now,
    };
  }

  if (live && toCents < live.previousPriceCents) {
    return { ...live, priceCents: toCents };
  }

  return null;
}

export function isRecent(drop: PriceDrop, now: Date): boolean {
  return drop.droppedAt.getTime() >= now.getTime() - PRICE_DROP_WINDOW_DAYS * DAY;
}

/** Whole percent below the starting price, rounded down so 2.9% is not 3%. */
export function dropPercent(drop: PriceDrop): number {
  return Math.floor(
    ((drop.previousPriceCents - drop.priceCents) / drop.previousPriceCents) * 100,
  );
}
