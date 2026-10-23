/**
 * The category taxonomy (data/taxonomy.json) applied to the core database.
 * Used by `pnpm run taxonomy:sync` (run on every deploy, after migrations)
 * and by the seed.
 *
 * Upserts every category by slug, in the file's order, departments before
 * aisles. Never deletes: a category the file no longer lists is retired
 * (isActive false), and when the file names its replacement (`replaces` on
 * the new entry) its products move there. Running it twice changes nothing.
 */
import { readFileSync } from 'node:fs';

export const TAXONOMY_PATH = new URL('../data/taxonomy.json', import.meta.url);

export function loadTaxonomy(path = TAXONOMY_PATH) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const slugs = new Set();
  for (const category of data.categories) {
    if (slugs.has(category.slug)) throw new Error(`Duplicate category slug: ${category.slug}`);
    if (category.parent && !slugs.has(category.parent)) {
      throw new Error(`${category.slug}: parent ${category.parent} must come before it`);
    }
    slugs.add(category.slug);
  }
  return data;
}

export async function syncTaxonomy(core, data = loadTaxonomy()) {
  const ids = new Map();
  let created = 0;
  let updated = 0;

  for (const category of data.categories) {
    const fields = {
      name: category.names.es,
      translations: { en: category.names.en, de: category.names.de, pt: category.names.pt },
      parentId: category.parent ? ids.get(category.parent) : null,
      position: category.position,
      isActive: true,
      replacedById: null,
      synonyms: category.synonyms ?? {},
      offTags: category.offTags ?? [],
    };
    const existing = await core.category.findUnique({ where: { slug: category.slug }, select: { id: true } });
    const row = await core.category.upsert({
      where: { slug: category.slug },
      create: { slug: category.slug, ...fields },
      update: fields,
    });
    ids.set(category.slug, row.id);
    existing ? (updated += 1) : (created += 1);

    // A category this one replaces hands over its products, then retires.
    for (const old of category.replaces ?? []) {
      const retired = await core.category.findUnique({ where: { slug: old } });
      if (!retired || retired.id === row.id) continue;
      await core.product.updateMany({ where: { categoryId: retired.id }, data: { categoryId: row.id } });
      await core.category.update({ where: { id: retired.id }, data: { isActive: false, replacedById: row.id } });
    }
  }

  // Anything no longer in the file is retired, never deleted: products and
  // shoppers' interests may still point at it.
  const { count: retired } = await core.category.updateMany({
    where: { slug: { notIn: [...ids.keys()] }, isActive: true },
    data: { isActive: false },
  });

  return { created, updated, retired };
}
