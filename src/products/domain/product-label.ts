/**
 * What a product is, for people who eat a certain way: gluten-free (sin
 * TACC), vegan, and so on. Not categories — a gluten-free pasta is still a
 * pasta — but labels any product may carry several of.
 */
export const PRODUCT_LABELS = [
  'gluten-free',
  'vegan',
  'vegetarian',
  'organic',
  'lactose-free',
  'sugar-free',
  'kosher',
  'halal',
] as const;
export type ProductLabel = (typeof PRODUCT_LABELS)[number];

/** Open Food Facts label tags that mean ours. */
const LABEL_BY_TAG: Record<string, ProductLabel> = {
  'en:no-gluten': 'gluten-free',
  'en:gluten-free': 'gluten-free',
  'en:vegan': 'vegan',
  'en:vegetarian': 'vegetarian',
  'en:organic': 'organic',
  'en:eu-organic': 'organic',
  'en:no-lactose': 'lactose-free',
  'en:lactose-free': 'lactose-free',
  'en:no-added-sugar': 'sugar-free',
  'en:sugar-free': 'sugar-free',
  'en:kosher': 'kosher',
  'en:halal': 'halal',
};

/** Our labels in their label tags, each once, in our order. */
export function labelsFromTags(tags: string[]): ProductLabel[] {
  const found = new Set(tags.map((tag) => LABEL_BY_TAG[tag]).filter(Boolean));
  return PRODUCT_LABELS.filter((label) => found.has(label));
}

/** Stored labels, keeping only ones we know, in our order. */
export const asLabels = (value: readonly string[]): ProductLabel[] =>
  PRODUCT_LABELS.filter((label) => value.includes(label));
