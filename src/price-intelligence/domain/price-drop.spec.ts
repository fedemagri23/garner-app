import {
  dropPercent,
  nextPriceDrop,
  type PriceChange,
  type PriceDrop,
} from './price-drop.js';

const now = new Date('2026-10-19T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const change = (fromCents: number | null, toCents: number | null): PriceChange => ({
  productId: 'product-1',
  storeId: 'store-1',
  currency: 'ARS',
  fromCents,
  toCents,
});

const drop = (overrides: Partial<PriceDrop> = {}): PriceDrop => ({
  productId: 'product-1',
  storeId: 'store-1',
  currency: 'ARS',
  priceCents: 145000,
  previousPriceCents: 150000,
  droppedAt: new Date(now.getTime() - DAY),
  ...overrides,
});

describe('nextPriceDrop', () => {
  it('records a fall from the previous price', () => {
    expect(nextPriceDrop(null, change(150000, 139000), now)).toEqual({
      productId: 'product-1',
      storeId: 'store-1',
      currency: 'ARS',
      priceCents: 139000,
      previousPriceCents: 150000,
      droppedAt: now,
    });
  });

  it('merges consecutive falls into one drop from where it started', () => {
    expect(nextPriceDrop(drop(), change(145000, 139000), now)).toMatchObject({
      priceCents: 139000,
      previousPriceCents: 150000,
      droppedAt: now,
    });
  });

  it('starts afresh once the earlier drop is out of the window', () => {
    const old = drop({ droppedAt: new Date(now.getTime() - 8 * DAY) });

    expect(nextPriceDrop(old, change(145000, 139000), now)).toMatchObject({
      previousPriceCents: 145000,
    });
  });

  it('keeps a drop through a rise that stays under the starting price', () => {
    const current = drop({ priceCents: 139000 });

    expect(nextPriceDrop(current, change(139000, 142000), now)).toEqual({
      ...current,
      priceCents: 142000,
    });
  });

  it('ends a drop once the price is back where it started', () => {
    expect(nextPriceDrop(drop(), change(145000, 150000), now)).toBeNull();
    expect(nextPriceDrop(drop(), change(145000, 160000), now)).toBeNull();
  });

  it('has nothing to say about a first price or a removed one', () => {
    expect(nextPriceDrop(null, change(null, 139000), now)).toBeNull();
    expect(nextPriceDrop(drop(), change(145000, null), now)).toBeNull();
  });

  it('does not merge across currencies', () => {
    const dollars = drop({ currency: 'USD', previousPriceCents: 900000 });

    expect(nextPriceDrop(dollars, change(150000, 139000), now)).toMatchObject({
      currency: 'ARS',
      previousPriceCents: 150000,
    });
  });
});

describe('dropPercent', () => {
  it('is the whole percent below the starting price, rounded down', () => {
    expect(dropPercent(drop({ priceCents: 132000, previousPriceCents: 150000 }))).toBe(12);
    expect(dropPercent(drop({ priceCents: 97100, previousPriceCents: 100000 }))).toBe(2);
  });
});
