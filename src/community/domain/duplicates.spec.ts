import { looksLikeSameProduct, looksLikeSameStore, type ProductIdentity } from './duplicates.js';

const milk = (overrides: Partial<ProductIdentity> = {}): ProductIdentity => ({
  normalizedName: 'leche entera',
  brandId: 'serenisima',
  packageSize: 1,
  unit: 'LITER',
  ...overrides,
});

describe('looksLikeSameProduct', () => {
  it('matches the same words, brand and size', () => {
    expect(looksLikeSameProduct(milk(), milk())).toBe(true);
  });

  it('tells apart another brand, other words, or another size', () => {
    expect(looksLikeSameProduct(milk(), milk({ brandId: 'sancor' }))).toBe(false);
    expect(looksLikeSameProduct(milk(), milk({ normalizedName: 'leche descremada' }))).toBe(false);
    expect(looksLikeSameProduct(milk(), milk({ packageSize: 0.5 }))).toBe(false);
    expect(looksLikeSameProduct(milk(), milk({ unit: 'KILOGRAM' }))).toBe(false);
  });

  it('lets a missing size match, since people leave it out', () => {
    expect(looksLikeSameProduct(milk(), milk({ packageSize: null }))).toBe(true);
  });

  it('treats a missing brand as a brand of its own', () => {
    expect(looksLikeSameProduct(milk(), milk({ brandId: null }))).toBe(false);
  });
});

describe('looksLikeSameStore', () => {
  const coto = { supermarketId: 'coto', latitude: -34.6037, longitude: -58.3816 };

  it('matches the same chain a few metres away', () => {
    expect(looksLikeSameStore(coto, { ...coto, latitude: -34.60385 })).toBe(true);
  });

  it('does not match the same chain a few blocks away, or another chain next door', () => {
    expect(looksLikeSameStore(coto, { ...coto, latitude: -34.6065 })).toBe(false);
    expect(looksLikeSameStore(coto, { ...coto, supermarketId: 'dia' })).toBe(false);
  });
});
