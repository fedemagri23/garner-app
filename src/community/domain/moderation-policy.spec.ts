import { dailyCreationLimit, shouldHide, trustScore } from './moderation-policy.js';

describe('shouldHide', () => {
  it('hides an entry once three trusted people flagged it', () => {
    expect(shouldHide([{ trust: 1 }, { trust: 1 }, { trust: 1 }])).toBe(true);
    expect(shouldHide([{ trust: 1 }, { trust: 1 }])).toBe(false);
  });

  it('counts a throwaway account for little, so a few cannot bury a good entry', () => {
    expect(shouldHide(Array.from({ length: 10 }, () => ({ trust: 0.1 })))).toBe(false);
    expect(shouldHide(Array.from({ length: 30 }, () => ({ trust: 0.1 })))).toBe(true);
  });

  it('clamps nonsense trust values', () => {
    expect(shouldHide([{ trust: 50 }, { trust: -4 }])).toBe(false);
  });
});

describe('trustScore', () => {
  it('starts a new account at zero and grows with age and accepted entries', () => {
    expect(trustScore({ accepted: 0, hiddenOrRejected: 0, accountAgeDays: 0 })).toBe(0);
    expect(trustScore({ accepted: 8, hiddenOrRejected: 0, accountAgeDays: 60 })).toBeCloseTo(0.8);
  });

  it('falls with entries moderators removed, and stays within 0 and 1', () => {
    expect(trustScore({ accepted: 8, hiddenOrRejected: 2, accountAgeDays: 60 })).toBeCloseTo(0.3);
    expect(trustScore({ accepted: 0, hiddenOrRejected: 9, accountAgeDays: 0 })).toBe(0);
    expect(trustScore({ accepted: 999, hiddenOrRejected: 0, accountAgeDays: 9999 })).toBeLessThanOrEqual(1);
  });
});

describe('dailyCreationLimit', () => {
  it('allows little in the first day, and for an account with removed entries', () => {
    expect(dailyCreationLimit('product', { ageHours: 3, trust: 0.9 })).toBe(3);
    expect(dailyCreationLimit('store', { ageHours: 3, trust: 0.9 })).toBe(1);
    expect(dailyCreationLimit('product', { ageHours: 500, trust: 0 })).toBe(3);
  });

  it('allows more to an established account', () => {
    expect(dailyCreationLimit('product', { ageHours: 500, trust: 0.6 })).toBe(30);
    expect(dailyCreationLimit('store', { ageHours: 500, trust: 0.6 })).toBe(5);
  });
});
