/**
 * Folding a duplicate product into the one that stays, in the core
 * database: everything that points at the duplicate points at the kept
 * one, without breaking a uniqueness rule (a list with both keeps one line
 * with both quantities; a person who confirmed both counts once). The
 * duplicate is left MERGED, inactive, pointing at the kept one.
 */
/** Why a merge could not happen: a product missing, or one that cannot take part. */
export type MergeOutcome = 'merged' | 'not-found' | 'invalid';

export interface ProductMerger {
  /** `invalid`: the same product twice, or one already merged or hidden. */
  merge(fromProductId: string, intoProductId: string): Promise<MergeOutcome>;
}

export const PRODUCT_MERGER = Symbol('PRODUCT_MERGER');
