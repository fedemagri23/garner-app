/** Forgets what was derived for a product that no longer exists on its own. */
export interface MergedProductCleanup {
  forget(productId: string): Promise<void>;
}

export const MERGED_PRODUCT_CLEANUP = Symbol('MERGED_PRODUCT_CLEANUP');
