import { haversineKm, type Coordinates } from '../../supermarkets/domain/geo.js';

/** A new shop this close to one of the same chain is almost surely that shop. */
export const SAME_STORE_METRES = 50;

export interface ProductIdentity {
  /** Lower-cased, accent-stripped name (`normalizeProductName`). */
  normalizedName: string;
  brandId: string | null;
  /** Package size in `unit`, null when unknown. */
  packageSize: number | null;
  unit: string;
}

/**
 * Whether two products look like the same thing: the same words, brand and
 * package. A missing size on either side matches any size, since people leave
 * it out; two different sizes never match ("Leche 1 L" is not "Leche 500 ml").
 */
export function looksLikeSameProduct(a: ProductIdentity, b: ProductIdentity): boolean {
  if (a.normalizedName !== b.normalizedName || a.brandId !== b.brandId) {
    return false;
  }
  if (a.packageSize === null || b.packageSize === null) {
    return true;
  }
  return a.unit === b.unit && Math.abs(a.packageSize - b.packageSize) < 1e-9;
}

export interface StoreIdentity extends Coordinates {
  supermarketId: string;
}

/** Whether a new shop is the same branch as an existing one: same chain, within a few metres. */
export function looksLikeSameStore(a: StoreIdentity, b: StoreIdentity): boolean {
  return a.supermarketId === b.supermarketId && haversineKm(a, b) * 1000 <= SAME_STORE_METRES;
}
