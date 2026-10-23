import type { Language } from '../../common/i18n/language.js';
import type { UnitOfMeasure } from './unit-of-measure.js';

/**
 * What an outside product database says about a barcode, before it becomes
 * anything of ours: names by language, brands, the quantity as printed, its
 * category tags and a picture. Only ever used to fill in a form a shopper
 * then checks; never written to the catalog on its own.
 */
export interface ProductFacts {
  code: string;
  /** The name in each language it has one in; `default` is its main one. */
  names: Partial<Record<Language | 'default', string>>;
  brands: string[];
  /** As printed: "500 g", "1,5 l", "6 x 330 ml". */
  quantity: string | null;
  /** Their taxonomy, most general first: "en:dairies", "en:milks". */
  categoryTags: string[];
  imageUrl: string | null;
}

/** The name to show a shopper: in their language, else the product's own. */
export function chooseName(facts: Pick<ProductFacts, 'names'>, language: Language): string | null {
  const name = facts.names[language] ?? facts.names.default ?? Object.values(facts.names)[0];
  return name?.trim() || null;
}

/** The brand as a shopper would type it: the first one listed. */
export function chooseBrand(facts: Pick<ProductFacts, 'brands'>): string | null {
  return facts.brands.map((brand) => brand.trim()).find(Boolean) ?? null;
}

const UNITS: Record<string, { unit: UnitOfMeasure; factor: number }> = {
  g: { unit: 'GRAM', factor: 1 },
  gr: { unit: 'GRAM', factor: 1 },
  grs: { unit: 'GRAM', factor: 1 },
  kg: { unit: 'KILOGRAM', factor: 1 },
  ml: { unit: 'MILLILITER', factor: 1 },
  cl: { unit: 'MILLILITER', factor: 10 },
  dl: { unit: 'MILLILITER', factor: 100 },
  l: { unit: 'LITER', factor: 1 },
  lt: { unit: 'LITER', factor: 1 },
  u: { unit: 'UNIT', factor: 1 },
  un: { unit: 'UNIT', factor: 1 },
  unid: { unit: 'UNIT', factor: 1 },
  unidades: { unit: 'UNIT', factor: 1 },
  pcs: { unit: 'UNIT', factor: 1 },
  stk: { unit: 'UNIT', factor: 1 },
  stück: { unit: 'UNIT', factor: 1 },
};

/**
 * A package's size from the quantity as printed: "500 g", "1,5 l", "70 cl"
 * (700 ml), "12 u". Null for anything it cannot read with confidence — a
 * multipack ("6 x 330 ml"), two quantities, or an unknown unit — since a
 * wrong size is worse than an empty field the shopper fills in.
 */
export function parseQuantity(quantity: string | null): { packageSize: number; unit: UnitOfMeasure } | null {
  if (!quantity) return null;
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Zäöüß]+)\.?\s*$/.exec(quantity);
  if (!match) return null;

  const amount = Number(match[1].replace(',', '.'));
  const known = UNITS[match[2].toLowerCase()];
  if (!known || !(amount > 0)) return null;

  const packageSize = Math.round(amount * known.factor * 1000) / 1000;
  return { packageSize, unit: known.unit };
}

/**
 * Their category tags into one of ours, using each category's `offTags`
 * from the taxonomy: the match on their most specific tag wins (their tags
 * run from general to specific), and an aisle beats its department.
 */
export function categoryForTags<T extends { offTags: string[]; parentId: string | null }>(
  categories: T[],
  tags: string[],
): T | null {
  for (const tag of [...tags].reverse()) {
    const matches = categories.filter((category) => category.offTags.includes(tag));
    const best = matches.find((category) => category.parentId !== null) ?? matches[0];
    if (best) return best;
  }
  return null;
}

/**
 * An outside database of products by barcode. `find` answers null when it
 * does not know the code, and throws when it could not be asked (down, slow,
 * limiting us) — which the caller treats as "nothing to suggest".
 */
export interface ProductFactsSource {
  find(code: string): Promise<ProductFacts | null>;
}

export const PRODUCT_FACTS_SOURCE = Symbol('PRODUCT_FACTS_SOURCE');
