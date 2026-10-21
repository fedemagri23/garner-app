/** How many different products need an accepted price before a shop is shown to everyone. */
export const PRODUCTS_NEEDED = 10;

export interface PublicationProgress {
  published: boolean;
  pricedProducts: number;
  productsNeeded: number;
  /** Products still to price; 0 once there are enough. */
  productsRemaining: number;
}

/**
 * Whether a shop a shopper added is ready for everyone to see, and how far it
 * is: private to its creator until ten different products have an accepted
 * price there.
 *
 * Those prices are, by construction, almost all the creator's own: nobody else
 * can see the shop yet. What keeps a made-up shop out is that each price must
 * pass the price pipeline's checks, that a new account may add one shop a day,
 * and that once public, flags take it down again (CON-051).
 */
export function publicationProgress(pricedProducts: number): PublicationProgress {
  const productsRemaining = Math.max(0, PRODUCTS_NEEDED - pricedProducts);

  return {
    published: productsRemaining === 0,
    pricedProducts,
    productsNeeded: PRODUCTS_NEEDED,
    productsRemaining,
  };
}
