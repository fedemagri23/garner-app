import { isValidBarcode, normalizeBarcode } from '../../products/domain/barcode.js';
import { normalizeProductName } from '../../products/domain/product.entity.js';
import type { Product } from '../../products/domain/product.entity.js';
import type { ExternalProduct } from './price-source-adapter.port.js';
import { ProductMatchMethod } from './external-price-source.entity.js';

/**
 * Tying a supermarket's product to ours.
 *
 * The ordering is by how certain each signal is, and the rule underneath is
 * that a wrong match is worse than no match: it files one shop's prices
 * against another product and corrupts both histories. So anything ambiguous
 * is left for a person, and nothing here ever creates a canonical product.
 */

export interface MatchCandidateSource {
  /** A product already linked to this external id by an earlier import. */
  linkedProductId: string | null;
  /** The product carrying the external barcode, if any. */
  byBarcode: Product | null;
  /** Products whose normalized name matches exactly. */
  byNormalizedName: Product[];
}

export interface ProductMatch {
  productId: string;
  method: ProductMatchMethod;
}

export function matchExternalProduct(
  external: ExternalProduct,
  candidates: MatchCandidateSource,
): ProductMatch | null {
  // A link a person or an earlier import established already answers this,
  // and keeps the answer stable when a source renames a product.
  if (candidates.linkedProductId) {
    return {
      productId: candidates.linkedProductId,
      method: ProductMatchMethod.ExternalId,
    };
  }

  if (
    external.barcode &&
    isValidBarcode(external.barcode) &&
    candidates.byBarcode
  ) {
    return {
      productId: candidates.byBarcode.id,
      method: ProductMatchMethod.Barcode,
    };
  }

  const identical = candidates.byNormalizedName.filter((product) =>
    hasSamePackage(product, external),
  );

  // Exactly one product of that name in that package size. Two would mean the
  // name does not identify a product, and guessing between them is the mistake
  // this whole function exists to avoid.
  if (identical.length === 1) {
    return {
      productId: identical[0].id,
      method: ProductMatchMethod.NormalizedIdentity,
    };
  }

  return null;
}

/** The normalized name an external product should be looked up by. */
export function externalMatchKey(external: ExternalProduct): string {
  return normalizeProductName(
    external.brand ? `${external.brand} ${external.name}` : external.name,
  );
}

/** Digits-only barcode, or null when the source sent something unusable. */
export function externalBarcode(external: ExternalProduct): string | null {
  if (!external.barcode) {
    return null;
  }

  const normalized = normalizeBarcode(external.barcode);
  return isValidBarcode(normalized) ? normalized : null;
}

/**
 * Sources write units their own way — "L", "lt", "litro". Mapping them onto
 * ours is what lets a size comparison mean anything.
 */
export function normalizeExternalUnit(unit: string | undefined): string | null {
  if (!unit) {
    return null;
  }

  const cleaned = unit.trim().toLowerCase().replace(/\./g, '');

  const known: Record<string, string> = {
    g: 'GRAM',
    gr: 'GRAM',
    gram: 'GRAM',
    gramo: 'GRAM',
    gramos: 'GRAM',
    kg: 'KILOGRAM',
    kilo: 'KILOGRAM',
    kilos: 'KILOGRAM',
    kilogram: 'KILOGRAM',
    ml: 'MILLILITER',
    cc: 'MILLILITER',
    l: 'LITER',
    lt: 'LITER',
    lts: 'LITER',
    litro: 'LITER',
    litros: 'LITER',
    liter: 'LITER',
    u: 'UNIT',
    un: 'UNIT',
    uni: 'UNIT',
    unidad: 'UNIT',
    unit: 'UNIT',
  };

  return known[cleaned] ?? null;
}

function hasSamePackage(product: Product, external: ExternalProduct): boolean {
  const externalUnit = normalizeExternalUnit(external.unit);

  // A source that says nothing about the package cannot contradict ours, so
  // the name alone decides.
  if (external.packageSize === undefined && externalUnit === null) {
    return true;
  }

  if (externalUnit !== null && externalUnit !== product.unit) {
    return false;
  }

  if (external.packageSize === undefined) {
    return true;
  }

  return (
    product.packageSize !== null &&
    Math.abs(product.packageSize - external.packageSize) < 0.001
  );
}
