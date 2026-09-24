import {
  alertDedupeKey,
  deliveryTime,
  evaluateAlert,
  isQuietHour,
  isThrottled,
  type PriceChange,
} from './alert-rules.js';
import type { PriceAlert } from './price-alert.entity.js';

const alert = (overrides: Partial<PriceAlert> = {}): PriceAlert => ({
  id: 'alert-1',
  ownerId: 'user-1',
  productId: 'milk',
  type: 'BELOW_THRESHOLD',
  storeId: null,
  thresholdCents: 100,
  dropPercent: null,
  latitude: null,
  longitude: null,
  radiusKm: null,
  isEnabled: true,
  lastTriggeredAt: null,
  lastNotifiedPriceCents: null,
  createdAt: new Date(),
  ...overrides,
});

const change = (overrides: Partial<PriceChange> = {}): PriceChange => ({
  productId: 'milk',
  storeId: 'store-1',
  priceCents: 90,
  previousPriceCents: 120,
  ...overrides,
});

describe('evaluateAlert', () => {
  it('ignores a disabled alert', () => {
    expect(evaluateAlert(alert({ isEnabled: false }), change()).triggered).toBe(false);
  });

  it('ignores another product', () => {
    expect(evaluateAlert(alert(), change({ productId: 'bread' })).triggered).toBe(false);
  });

  it('ignores another store when the alert names one', () => {
    expect(
      evaluateAlert(alert({ storeId: 'store-2' }), change()).triggered,
    ).toBe(false);
  });

  describe('below a threshold', () => {
    it('triggers once the price reaches the figure named', () => {
      expect(evaluateAlert(alert(), change({ priceCents: 100 }))).toEqual({
        triggered: true,
        reason: 'BELOW_THRESHOLD',
      });
    });

    it('stays quiet above it', () => {
      expect(evaluateAlert(alert(), change({ priceCents: 101 })).triggered).toBe(false);
    });

    it('does not repeat news the shopper already has', () => {
      expect(
        evaluateAlert(
          alert({ lastNotifiedPriceCents: 90 }),
          change({ priceCents: 95 }),
        ),
      ).toEqual({ triggered: false, reason: 'ALREADY_KNOWN' });
    });

    it('speaks again for a new low', () => {
      expect(
        evaluateAlert(
          alert({ lastNotifiedPriceCents: 90 }),
          change({ priceCents: 80 }),
        ).triggered,
      ).toBe(true);
    });
  });

  describe('a meaningful drop', () => {
    const dropAlert = alert({
      type: 'PRICE_DROP',
      thresholdCents: null,
      dropPercent: 20,
    });

    it('triggers on a fall of at least the percentage asked for', () => {
      expect(
        evaluateAlert(dropAlert, change({ previousPriceCents: 100, priceCents: 80 })),
      ).toEqual({ triggered: true, reason: 'PRICE_DROP' });
    });

    it('stays quiet for a smaller fall', () => {
      expect(
        evaluateAlert(dropAlert, change({ previousPriceCents: 100, priceCents: 85 }))
          .triggered,
      ).toBe(false);
    });

    it('has nothing to compare on a first price', () => {
      expect(
        evaluateAlert(dropAlert, change({ previousPriceCents: null })).triggered,
      ).toBe(false);
    });

    it('never treats a rise as a drop', () => {
      expect(
        evaluateAlert(dropAlert, change({ previousPriceCents: 80, priceCents: 100 }))
          .triggered,
      ).toBe(false);
    });
  });

  describe('cheaper nearby', () => {
    const nearbyAlert = alert({
      type: 'CHEAPER_NEARBY',
      thresholdCents: null,
      latitude: -34.6,
      longitude: -58.38,
      radiusKm: 5,
    });

    it('triggers when a store within reach becomes the cheapest', () => {
      expect(
        evaluateAlert(
          nearbyAlert,
          change({ priceCents: 90, distanceKm: 2, bestOtherNearbyPriceCents: 110 }),
        ),
      ).toEqual({ triggered: true, reason: 'CHEAPER_NEARBY' });
    });

    it('ignores a store beyond the radius', () => {
      expect(
        evaluateAlert(
          nearbyAlert,
          change({ distanceKm: 40, bestOtherNearbyPriceCents: 110 }),
        ).triggered,
      ).toBe(false);
    });

    it('stays quiet when somewhere else is still cheaper', () => {
      expect(
        evaluateAlert(
          nearbyAlert,
          change({ priceCents: 120, distanceKm: 2, bestOtherNearbyPriceCents: 110 }),
        ).triggered,
      ).toBe(false);
    });

    it('has nothing to say with nothing to compare against', () => {
      expect(
        evaluateAlert(
          nearbyAlert,
          change({ distanceKm: 2, bestOtherNearbyPriceCents: null }),
        ).triggered,
      ).toBe(false);
    });
  });
});

describe('isThrottled', () => {
  const now = new Date('2026-09-24T12:00:00Z');
  const preferences = { minMinutesBetweenAlerts: 360 };

  it('lets a first message through', () => {
    expect(isThrottled({ lastTriggeredAt: null }, preferences, now)).toBe(false);
  });

  it('holds a second message inside the window', () => {
    expect(
      isThrottled(
        { lastTriggeredAt: new Date('2026-09-24T09:00:00Z') },
        preferences,
        now,
      ),
    ).toBe(true);
  });

  it('lets one through once the window has passed', () => {
    expect(
      isThrottled(
        { lastTriggeredAt: new Date('2026-09-24T05:00:00Z') },
        preferences,
        now,
      ),
    ).toBe(false);
  });
});

describe('quiet hours', () => {
  const overnight = { quietHoursStartUtc: 22, quietHoursEndUtc: 7 };

  it('covers a period that wraps midnight', () => {
    expect(isQuietHour(overnight, new Date('2026-09-24T23:30:00Z'))).toBe(true);
    expect(isQuietHour(overnight, new Date('2026-09-25T03:00:00Z'))).toBe(true);
    expect(isQuietHour(overnight, new Date('2026-09-24T12:00:00Z'))).toBe(false);
  });

  it('covers a period inside one day', () => {
    const siesta = { quietHoursStartUtc: 13, quietHoursEndUtc: 16 };

    expect(isQuietHour(siesta, new Date('2026-09-24T14:00:00Z'))).toBe(true);
    expect(isQuietHour(siesta, new Date('2026-09-24T17:00:00Z'))).toBe(false);
  });

  it('is never quiet when no period is set', () => {
    expect(
      isQuietHour({ quietHoursStartUtc: null, quietHoursEndUtc: null }, new Date()),
    ).toBe(false);
  });

  it('holds a message until the quiet period ends rather than dropping it', () => {
    expect(
      deliveryTime(overnight, new Date('2026-09-24T23:30:00Z')).toISOString(),
    ).toBe('2026-09-25T07:00:00.000Z');

    expect(
      deliveryTime(overnight, new Date('2026-09-25T03:00:00Z')).toISOString(),
    ).toBe('2026-09-25T07:00:00.000Z');
  });

  it('delivers at once outside quiet hours', () => {
    const noon = new Date('2026-09-24T12:00:00Z');
    expect(deliveryTime(overnight, noon)).toEqual(noon);
  });
});

describe('alertDedupeKey', () => {
  it('identifies the news, so two workers raise one message', () => {
    const key = alertDedupeKey({ id: 'alert-1' }, { storeId: 'store-1', priceCents: 90 });

    expect(key).toBe('alert:alert-1:store-1:90');
    expect(alertDedupeKey({ id: 'alert-1' }, { storeId: 'store-1', priceCents: 89 }))
      .not.toBe(key);
  });
});
