import { confidenceLevel, confidenceScore } from './price-confidence.js';
import type { WeightedPrice } from './price-weighting.js';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-22T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY);

const price = (overrides: Partial<WeightedPrice> = {}): WeightedPrice => ({
  priceCents: 125,
  minPriceCents: 125,
  maxPriceCents: 125,
  totalWeight: 3,
  observationCount: 3,
  lastObservedAt: now,
  ...overrides,
});

describe('confidenceScore', () => {
  it('is high for fresh, plentiful, agreeing observations', () => {
    expect(confidenceScore(price(), now)).toBeGreaterThan(0.9);
  });

  it('falls as the newest observation ages', () => {
    expect(confidenceScore(price({ lastObservedAt: ago(14) }), now)).toBeLessThan(
      confidenceScore(price({ lastObservedAt: ago(1) }), now),
    );
  });

  it('falls when a single weak observation is all there is', () => {
    expect(confidenceScore(price({ totalWeight: 0.5, observationCount: 1 }), now))
      .toBeLessThan(confidenceScore(price(), now));
  });

  it('falls when observations disagree', () => {
    expect(
      confidenceScore(price({ minPriceCents: 60, maxPriceCents: 250 }), now),
    ).toBeLessThan(confidenceScore(price(), now));
  });

  it('stays within 0..1', () => {
    expect(confidenceScore(price({ totalWeight: 1000 }), now)).toBeLessThanOrEqual(1);
    expect(
      confidenceScore(
        price({ lastObservedAt: ago(400), totalWeight: 0.01, minPriceCents: 1, maxPriceCents: 9999 }),
        now,
      ),
    ).toBeGreaterThanOrEqual(0);
  });
});

describe('confidenceLevel', () => {
  it('calls a fresh, well-supported price very recent', () => {
    expect(confidenceLevel(0.9, ago(0.5), now)).toBe('VERY_RECENT');
  });

  it('will not call a thin price very recent, however fresh', () => {
    expect(confidenceLevel(0.3, ago(0.5), now)).not.toBe('VERY_RECENT');
  });

  it('calls a price from this week recently verified', () => {
    expect(confidenceLevel(0.6, ago(5), now)).toBe('RECENTLY_VERIFIED');
  });

  it('lets age override a strong score', () => {
    expect(confidenceLevel(0.95, ago(20), now)).toBe('LIKELY_CURRENT');
    expect(confidenceLevel(0.95, ago(60), now)).toBe('POSSIBLY_OUTDATED');
  });
});
