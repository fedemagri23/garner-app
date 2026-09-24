import type { NotificationPreferences, PriceAlert } from './price-alert.entity.js';

/**
 * When a price change is worth telling someone about.
 *
 * The bar is deliberately high. A notification that repeats what a shopper
 * already knows, or arrives at three in the morning, teaches them to ignore
 * every notification after it — so the same news is never sent twice, and
 * nothing is sent during the hours they asked to be left alone.
 */

export interface PriceChange {
  productId: string;
  storeId: string;
  priceCents: number;
  /** Null when this is the first derived price for the product at the store. */
  previousPriceCents: number | null;
  /** Distance from the alert's point, for CHEAPER_NEARBY. */
  distanceKm?: number;
  /**
   * The cheapest price known nearby *other than* this store, for judging
   * whether this store has become the best place to buy it.
   */
  bestOtherNearbyPriceCents?: number | null;
}

export type TriggerDecision =
  | { triggered: false; reason: 'NOT_MATCHED' | 'ALREADY_KNOWN' | 'NOT_ENOUGH' }
  | { triggered: true; reason: PriceAlert['type'] };

/**
 * Whether this alert wants to hear about this change. Pure: throttling, quiet
 * hours and the shopper's preferences are separate decisions, applied after.
 */
export function evaluateAlert(
  alert: PriceAlert,
  change: PriceChange,
): TriggerDecision {
  if (!alert.isEnabled || alert.productId !== change.productId) {
    return { triggered: false, reason: 'NOT_MATCHED' };
  }

  // An alert naming a store only cares about that store.
  if (alert.storeId !== null && alert.storeId !== change.storeId) {
    return { triggered: false, reason: 'NOT_MATCHED' };
  }

  switch (alert.type) {
    case 'BELOW_THRESHOLD':
      return belowThreshold(alert, change);
    case 'PRICE_DROP':
      return priceDrop(alert, change);
    case 'CHEAPER_NEARBY':
      return cheaperNearby(alert, change);
  }
}

function belowThreshold(
  alert: PriceAlert,
  change: PriceChange,
): TriggerDecision {
  if (alert.thresholdCents === null || change.priceCents > alert.thresholdCents) {
    return { triggered: false, reason: 'NOT_ENOUGH' };
  }

  // Already told them it was under the threshold; only a new low is news.
  if (
    alert.lastNotifiedPriceCents !== null &&
    change.priceCents >= alert.lastNotifiedPriceCents
  ) {
    return { triggered: false, reason: 'ALREADY_KNOWN' };
  }

  return { triggered: true, reason: 'BELOW_THRESHOLD' };
}

function priceDrop(alert: PriceAlert, change: PriceChange): TriggerDecision {
  if (
    alert.dropPercent === null ||
    change.previousPriceCents === null ||
    change.previousPriceCents <= 0
  ) {
    return { triggered: false, reason: 'NOT_ENOUGH' };
  }

  const fall =
    ((change.previousPriceCents - change.priceCents) /
      change.previousPriceCents) *
    100;

  if (fall < alert.dropPercent) {
    return { triggered: false, reason: 'NOT_ENOUGH' };
  }

  if (
    alert.lastNotifiedPriceCents !== null &&
    change.priceCents >= alert.lastNotifiedPriceCents
  ) {
    return { triggered: false, reason: 'ALREADY_KNOWN' };
  }

  return { triggered: true, reason: 'PRICE_DROP' };
}

function cheaperNearby(alert: PriceAlert, change: PriceChange): TriggerDecision {
  const radius = alert.radiusKm;

  if (
    radius === null ||
    change.distanceKm === undefined ||
    change.distanceKm > radius
  ) {
    return { triggered: false, reason: 'NOT_MATCHED' };
  }

  const best = change.bestOtherNearbyPriceCents;

  // News only if this store is now the cheapest nearby. With nothing to
  // compare against there is no "cheaper" to report.
  if (best === undefined || best === null || change.priceCents >= best) {
    return { triggered: false, reason: 'NOT_ENOUGH' };
  }

  if (
    alert.lastNotifiedPriceCents !== null &&
    change.priceCents >= alert.lastNotifiedPriceCents
  ) {
    return { triggered: false, reason: 'ALREADY_KNOWN' };
  }

  return { triggered: true, reason: 'CHEAPER_NEARBY' };
}

/** Whether an alert has spoken too recently to speak again. */
export function isThrottled(
  alert: Pick<PriceAlert, 'lastTriggeredAt'>,
  preferences: Pick<NotificationPreferences, 'minMinutesBetweenAlerts'>,
  now: Date,
): boolean {
  if (!alert.lastTriggeredAt) {
    return false;
  }

  const elapsedMinutes =
    (now.getTime() - alert.lastTriggeredAt.getTime()) / 60_000;

  return elapsedMinutes < preferences.minMinutesBetweenAlerts;
}

/**
 * Whether `at` falls in the shopper's quiet hours, which may wrap midnight
 * (22 to 7 is the usual shape).
 */
export function isQuietHour(
  preferences: Pick<
    NotificationPreferences,
    'quietHoursStartUtc' | 'quietHoursEndUtc'
  >,
  at: Date,
): boolean {
  const { quietHoursStartUtc: start, quietHoursEndUtc: end } = preferences;

  if (start === null || end === null || start === end) {
    return false;
  }

  const hour = at.getUTCHours();

  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * When a message may be delivered: now, or the moment the quiet period ends.
 * Held rather than dropped — the news is still worth having at breakfast.
 */
export function deliveryTime(
  preferences: Pick<
    NotificationPreferences,
    'quietHoursStartUtc' | 'quietHoursEndUtc'
  >,
  now: Date,
): Date {
  if (!isQuietHour(preferences, now)) {
    return now;
  }

  const end = preferences.quietHoursEndUtc as number;
  const deliverAt = new Date(now);

  deliverAt.setUTCMinutes(0, 0, 0);
  deliverAt.setUTCHours(end);

  // The quiet period runs into tomorrow.
  if (deliverAt <= now) {
    deliverAt.setUTCDate(deliverAt.getUTCDate() + 1);
  }

  return deliverAt;
}

/**
 * Identifies the news itself, so two workers evaluating the same price change
 * raise one notification between them.
 */
export function alertDedupeKey(
  alert: Pick<PriceAlert, 'id'>,
  change: Pick<PriceChange, 'storeId' | 'priceCents'>,
): string {
  return `alert:${alert.id}:${change.storeId}:${change.priceCents}`;
}
