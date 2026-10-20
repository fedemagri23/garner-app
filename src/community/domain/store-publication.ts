/** How many different products need an accepted price before a shop is shown to everyone. */
export const PRODUCTS_NEEDED = 10;
/** And how many different people those prices must come from, so no one can publish their own shop alone. */
export const CONTRIBUTORS_NEEDED = 3;

export interface PublicationCounts {
  /** Distinct products with an accepted price at the shop, from anyone but its creator. */
  pricedProducts: number;
  /** Distinct users, other than the creator, behind those prices. */
  contributors: number;
}

export interface PublicationProgress {
  published: boolean;
  pricedProducts: number;
  productsNeeded: number;
  /** Products still to price; 0 once there are enough. */
  productsRemaining: number;
  contributors: number;
  contributorsNeeded: number;
  contributorsRemaining: number;
}

/**
 * Whether a shop a shopper added is ready for everyone to see, and how far it
 * is: private to its creator until enough products have an accepted price from
 * enough different people.
 */
export function publicationProgress(counts: PublicationCounts): PublicationProgress {
  const productsRemaining = Math.max(0, PRODUCTS_NEEDED - counts.pricedProducts);
  const contributorsRemaining = Math.max(0, CONTRIBUTORS_NEEDED - counts.contributors);

  return {
    published: productsRemaining === 0 && contributorsRemaining === 0,
    pricedProducts: counts.pricedProducts,
    productsNeeded: PRODUCTS_NEEDED,
    productsRemaining,
    contributors: counts.contributors,
    contributorsNeeded: CONTRIBUTORS_NEEDED,
    contributorsRemaining,
  };
}
