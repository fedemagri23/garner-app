import { publicationProgress } from './store-publication.js';

describe('publicationProgress', () => {
  it('keeps a shop private until ten products are priced by three different people', () => {
    expect(publicationProgress({ pricedProducts: 10, contributors: 3 }).published).toBe(true);
    expect(publicationProgress({ pricedProducts: 9, contributors: 3 }).published).toBe(false);
    expect(publicationProgress({ pricedProducts: 25, contributors: 2 }).published).toBe(false);
  });

  it('says how far a shop is', () => {
    expect(publicationProgress({ pricedProducts: 6, contributors: 1 })).toEqual({
      published: false,
      pricedProducts: 6,
      productsNeeded: 10,
      productsRemaining: 4,
      contributors: 1,
      contributorsNeeded: 3,
      contributorsRemaining: 2,
    });
  });

  it('never reports a negative remainder', () => {
    const progress = publicationProgress({ pricedProducts: 40, contributors: 9 });
    expect(progress.productsRemaining).toBe(0);
    expect(progress.contributorsRemaining).toBe(0);
  });
});
