import { publicationProgress } from './store-publication.js';

describe('publicationProgress', () => {
  it('keeps a shop private until ten products have an accepted price there', () => {
    expect(publicationProgress(9).published).toBe(false);
    expect(publicationProgress(10).published).toBe(true);
  });

  it('says how far a shop is', () => {
    expect(publicationProgress(6)).toEqual({
      published: false,
      pricedProducts: 6,
      productsNeeded: 10,
      productsRemaining: 4,
    });
  });

  it('never reports a negative remainder', () => {
    expect(publicationProgress(40).productsRemaining).toBe(0);
  });
});
