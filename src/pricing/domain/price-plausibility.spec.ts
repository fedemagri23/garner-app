import { checkPlausibility, MAX_PRICE_CENTS } from './price-plausibility.js';

describe('checkPlausibility', () => {
  const now = new Date('2026-09-17T12:00:00Z');
  const valid = {
    priceCents: 125,
    currency: 'ARS',
    observedAt: new Date('2026-09-17T11:30:00Z'),
    sourceType: 'USER_REPORTED' as const,
  };

  it('accepts a sensible recent price', () => {
    expect(checkPlausibility(valid, now)).toBeNull();
  });

  it.each([0, -5, 1.5])('rejects a price of %p cents', (priceCents) => {
    expect(checkPlausibility({ ...valid, priceCents }, now)).toBe(
      'PRICE_NOT_POSITIVE_INTEGER',
    );
  });

  it('rejects an absurd price', () => {
    expect(
      checkPlausibility({ ...valid, priceCents: MAX_PRICE_CENTS + 1 }, now),
    ).toBe('PRICE_TOO_HIGH');
  });

  it('rejects a malformed currency', () => {
    expect(checkPlausibility({ ...valid, currency: 'ars' }, now)).toBe(
      'CURRENCY_INVALID',
    );
  });

  it('tolerates a slightly fast device clock, not one far ahead', () => {
    expect(
      checkPlausibility(
        { ...valid, observedAt: new Date('2026-09-17T12:03:00Z') },
        now,
      ),
    ).toBeNull();
    expect(
      checkPlausibility(
        { ...valid, observedAt: new Date('2026-09-17T13:00:00Z') },
        now,
      ),
    ).toBe('OBSERVED_IN_FUTURE');
  });

  it('gives a purchase longer to arrive than a shelf report', () => {
    const twoWeeksAgo = new Date('2026-09-03T12:00:00Z');

    expect(checkPlausibility({ ...valid, observedAt: twoWeeksAgo }, now)).toBe(
      'OBSERVED_TOO_LONG_AGO',
    );
    expect(
      checkPlausibility(
        { ...valid, observedAt: twoWeeksAgo, sourceType: 'PURCHASE_CONFIRMED' },
        now,
      ),
    ).toBeNull();
  });
});
