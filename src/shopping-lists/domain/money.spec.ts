import {
  isCurrencyCode,
  isValidPriceCents,
  isValidQuantity,
  lineTotalCents,
} from './money.js';

describe('lineTotalCents', () => {
  it('multiplies whole quantities exactly', () => {
    expect(lineTotalCents(3, 125)).toBe(375);
  });

  it('handles fractional quantities by weight', () => {
    // 1.5 kg at 1.30 per kg.
    expect(lineTotalCents(1.5, 130)).toBe(195);
  });

  it('rounds half a cent up, once, at the line', () => {
    // 0.333 × 150 = 49.95 cents.
    expect(lineTotalCents(0.333, 150)).toBe(50);
    // 0.25 × 99 = 24.75 cents.
    expect(lineTotalCents(0.25, 99)).toBe(25);
    // 0.001 × 400 = 0.4 cents.
    expect(lineTotalCents(0.001, 400)).toBe(0);
  });

  it('does not drift the way a float sum of prices does', () => {
    // 0.1 + 0.2 !== 0.3 in floating point; in cents it is exact.
    const total = lineTotalCents(1, 10) + lineTotalCents(1, 20);
    expect(total).toBe(30);
  });

  it('treats a free item as costing nothing', () => {
    expect(lineTotalCents(4, 0)).toBe(0);
  });
});

describe('isValidQuantity', () => {
  it.each([1, 0.5, 1.25, 0.001, 9999])('accepts %p', (quantity) => {
    expect(isValidQuantity(quantity)).toBe(true);
  });

  it.each([0, -1, 10000, 0.0005, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects %p',
    (quantity) => {
      expect(isValidQuantity(quantity)).toBe(false);
    },
  );
});

describe('isValidPriceCents', () => {
  it('accepts whole non-negative cents', () => {
    expect(isValidPriceCents(0)).toBe(true);
    expect(isValidPriceCents(125)).toBe(true);
  });

  it('rejects fractions of a cent and negative prices', () => {
    expect(isValidPriceCents(1.5)).toBe(false);
    expect(isValidPriceCents(-1)).toBe(false);
  });
});

describe('isCurrencyCode', () => {
  it('accepts ISO 4217 codes and nothing looser', () => {
    expect(isCurrencyCode('ARS')).toBe(true);
    expect(isCurrencyCode('eur')).toBe(false);
    expect(isCurrencyCode('EURO')).toBe(false);
  });
});
