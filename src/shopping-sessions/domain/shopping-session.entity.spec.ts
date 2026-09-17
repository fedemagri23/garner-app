import {
  calculateSessionTotals,
  decideTransition,
  isOpen,
  resolvePurchasedAt,
  type SessionAction,
  type ShoppingSessionStatus,
} from './shopping-session.entity.js';

describe('decideTransition', () => {
  it.each<[ShoppingSessionStatus, SessionAction, ShoppingSessionStatus]>([
    ['ACTIVE', 'pause', 'PAUSED'],
    ['PAUSED', 'resume', 'ACTIVE'],
    ['ACTIVE', 'complete', 'COMPLETED'],
    ['PAUSED', 'complete', 'COMPLETED'],
    ['ACTIVE', 'abandon', 'ABANDONED'],
    ['PAUSED', 'abandon', 'ABANDONED'],
  ])('%s --%s--> %s', (from, action, to) => {
    expect(decideTransition(from, action)).toEqual({ kind: 'transition', to });
  });

  it.each<[ShoppingSessionStatus, SessionAction]>([
    ['PAUSED', 'pause'],
    ['ACTIVE', 'resume'],
    ['COMPLETED', 'complete'],
    ['ABANDONED', 'abandon'],
  ])('treats %s + %s as a replay of a request that already succeeded', (from, action) => {
    expect(decideTransition(from, action)).toEqual({ kind: 'replay' });
  });

  it.each<[ShoppingSessionStatus, SessionAction]>([
    ['COMPLETED', 'pause'],
    ['COMPLETED', 'resume'],
    ['COMPLETED', 'abandon'],
    ['ABANDONED', 'resume'],
    ['ABANDONED', 'complete'],
    ['ABANDONED', 'pause'],
  ])('rejects %s + %s', (from, action) => {
    expect(decideTransition(from, action).kind).toBe('rejected');
  });
});

describe('isOpen', () => {
  it('is open while active or paused, and closed once finished either way', () => {
    expect(isOpen('ACTIVE')).toBe(true);
    expect(isOpen('PAUSED')).toBe(true);
    expect(isOpen('COMPLETED')).toBe(false);
    expect(isOpen('ABANDONED')).toBe(false);
  });
});

describe('calculateSessionTotals', () => {
  const line = (
    quantity: number,
    expected: number | null,
    actual: number | null,
    isPurchased: boolean,
  ) => ({
    quantity,
    expectedUnitPriceCents: expected,
    actualUnitPriceCents: actual,
    isPurchased,
  });

  it('before anything is bought, everything is still to spend', () => {
    expect(
      calculateSessionTotals([line(2, 125, null, false), line(1, 89, null, false)]),
    ).toMatchObject({
      expectedTotalCents: 339,
      actualTotalCents: 0,
      remainingExpectedTotalCents: 339,
      projectedTotalCents: 339,
      purchasedItemCount: 0,
    });
  });

  it('an actual price overrides the expected one for a purchased item', () => {
    const totals = calculateSessionTotals([
      line(1, 125, 132, true),
      line(1, 89, null, false),
    ]);

    expect(totals).toMatchObject({
      expectedTotalCents: 214,
      actualTotalCents: 132,
      remainingExpectedTotalCents: 89,
      projectedTotalCents: 221,
      purchasedItemCount: 1,
    });
  });

  it('a purchased item confirmed without a new price counts at its expected price', () => {
    expect(calculateSessionTotals([line(2, 125, null, true)])).toMatchObject({
      actualTotalCents: 250,
      remainingExpectedTotalCents: 0,
      unpricedItemCount: 0,
    });
  });

  it('a price recorded for an item not yet bought does not count as spent', () => {
    // The shopper noted the shelf price but has not put it in the trolley.
    expect(calculateSessionTotals([line(1, 125, 140, false)])).toMatchObject({
      actualTotalCents: 0,
      remainingExpectedTotalCents: 125,
    });
  });

  it('applies quantity to actual prices too', () => {
    expect(calculateSessionTotals([line(1.5, 130, 140, true)])).toMatchObject({
      expectedTotalCents: 195,
      actualTotalCents: 210,
    });
  });

  it('counts lines with no known price instead of treating them as free', () => {
    const totals = calculateSessionTotals([
      line(1, null, null, false),
      line(1, null, null, true),
      line(1, null, 300, true),
    ]);

    expect(totals).toMatchObject({
      expectedTotalCents: 0,
      actualTotalCents: 300,
      unpricedItemCount: 2,
      purchasedItemCount: 2,
    });
  });

  it('actual + remaining always equals the projection', () => {
    const totals = calculateSessionTotals([
      line(3, 99, 105, true),
      line(0.75, 450, null, false),
      line(2, 200, null, true),
    ]);

    expect(totals.projectedTotalCents).toBe(
      totals.actualTotalCents + totals.remainingExpectedTotalCents,
    );
  });
});

describe('resolvePurchasedAt', () => {
  const startedAt = new Date('2026-09-17T10:00:00Z');
  const now = new Date('2026-09-17T10:30:00Z');

  it('keeps the moment an offline client reported', () => {
    const reported = new Date('2026-09-17T10:05:00Z');
    expect(resolvePurchasedAt(reported, startedAt, now)).toEqual(reported);
  });

  it('uses now when the client reports nothing', () => {
    expect(resolvePurchasedAt(undefined, startedAt, now)).toEqual(now);
  });

  it('refuses a time before the trip started', () => {
    expect(
      resolvePurchasedAt(new Date('2026-09-17T09:00:00Z'), startedAt, now),
    ).toEqual(now);
  });

  it('tolerates small clock skew but not a clock set far ahead', () => {
    const slightlyAhead = new Date('2026-09-17T10:32:00Z');
    const farAhead = new Date('2026-09-17T12:00:00Z');

    expect(resolvePurchasedAt(slightlyAhead, startedAt, now)).toEqual(slightlyAhead);
    expect(resolvePurchasedAt(farAhead, startedAt, now)).toEqual(now);
  });
});
