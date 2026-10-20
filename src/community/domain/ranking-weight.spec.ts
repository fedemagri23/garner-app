import { CatalogOrigin } from './catalog-origin.js';
import { rankingWeight, VERIFIED_BONUS, type WeightInputs } from './ranking-weight.js';

const inputs = (overrides: Partial<WeightInputs> = {}): WeightInputs => ({
  origin: CatalogOrigin.Community,
  confirmingUsers: 0,
  recentPricingUsers: 0,
  flaggingUsers: 0,
  daysSinceActivity: 0,
  ...overrides,
});

describe('rankingWeight', () => {
  it('starts a fresh community entry at zero', () => {
    expect(rankingWeight(inputs())).toBe(0);
  });

  it('rises with confirmations and price updates', () => {
    expect(rankingWeight(inputs({ confirmingUsers: 2 }))).toBe(6);
    expect(rankingWeight(inputs({ recentPricingUsers: 3 }))).toBe(6);
    expect(rankingWeight(inputs({ confirmingUsers: 2, recentPricingUsers: 3 }))).toBe(12);
  });

  it('stops counting after a point, so one popular entry cannot bury the rest for good', () => {
    expect(rankingWeight(inputs({ confirmingUsers: 500 }))).toBe(rankingWeight(inputs({ confirmingUsers: 20 })));
  });

  it('is lowered by flags but never goes below zero', () => {
    expect(rankingWeight(inputs({ confirmingUsers: 4, flaggingUsers: 1 }))).toBe(7);
    expect(rankingWeight(inputs({ flaggingUsers: 9 }))).toBe(0);
  });

  it('puts a team-verified entry above any community one', () => {
    const popular = rankingWeight(inputs({ confirmingUsers: 20, recentPricingUsers: 20 }));
    expect(rankingWeight(inputs({ origin: CatalogOrigin.Verified }))).toBe(VERIFIED_BONUS);
    expect(rankingWeight(inputs({ origin: CatalogOrigin.Verified }))).toBeGreaterThan(popular);
  });

  it('slides a little for a community entry nobody has touched for months, but not a verified one', () => {
    expect(rankingWeight(inputs({ confirmingUsers: 10, daysSinceActivity: 95 }))).toBe(27);
    expect(rankingWeight(inputs({ confirmingUsers: 10, daysSinceActivity: 10_000 }))).toBe(20);
    expect(rankingWeight(inputs({ origin: CatalogOrigin.Verified, daysSinceActivity: 10_000 }))).toBe(VERIFIED_BONUS);
  });
});
