/** Moves a merged duplicate's prices onto the product that stays (pricing database). */
export interface ProductPriceMover {
  /** The stores the duplicate had prices at, which now need recomputing for the kept product. */
  move(fromProductId: string, intoProductId: string): Promise<string[]>;
}

export const PRODUCT_PRICE_MOVER = Symbol('PRODUCT_PRICE_MOVER');
