/**
 * Text normalization shared by the catalog modules.
 *
 * Search only works if the stored form and the query go through exactly the
 * same transformation — "Leche La Serenísima" has to match a query of "serenisima",
 * so accents, case and stray whitespace are removed on both sides.
 */

/** Lower-cased, accent-stripped, whitespace-collapsed form used for matching. */
export function normalizeText(value: string): string {
  return (
    value
      .normalize('NFD')
      // Combining marks left behind by NFD — this is what turns "í" into "i".
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** URL- and index-friendly identifier derived from a human name. */
export function slugify(value: string): string {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
