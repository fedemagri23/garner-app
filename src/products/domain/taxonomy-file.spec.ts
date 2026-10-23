import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Entry {
  slug: string;
  parent: string | null;
  position: number;
  icon: string | null;
  names: Record<string, string>;
  synonyms: Record<string, string[]>;
  offTags: string[];
}

/** data/taxonomy.json, which `pnpm run taxonomy:sync` applies on every deploy. */
const { categories } = JSON.parse(readFileSync(join(process.cwd(), 'data/taxonomy.json'), 'utf8')) as {
  categories: Entry[];
};
const bySlug = new Map(categories.map((category) => [category.slug, category]));

describe('the category taxonomy file', () => {
  it('has unique slugs, made of lowercase words and dashes', () => {
    expect(bySlug.size).toBe(categories.length);
    for (const { slug } of categories) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('has two levels at most, each parent listed before its aisles', () => {
    categories.forEach((category, index) => {
      if (!category.parent) return;
      const parent = bySlug.get(category.parent);
      expect({ slug: category.slug, parentFound: !!parent }).toEqual({ slug: category.slug, parentFound: true });
      expect(parent!.parent).toBeNull();
      expect(categories.indexOf(parent!)).toBeLessThan(index);
    });
  });

  it('names every category in the four languages', () => {
    for (const { slug, names } of categories) {
      for (const language of ['es', 'en', 'de', 'pt']) {
        expect({ slug, language, named: !!names[language]?.trim() }).toEqual({ slug, language, named: true });
      }
    }
  });

  it('gives every department an icon and its aisles distinct positions', () => {
    for (const category of categories.filter((entry) => entry.parent === null)) {
      expect({ slug: category.slug, icon: !!category.icon }).toEqual({ slug: category.slug, icon: true });
    }
    const groups = new Map<string, number[]>();
    for (const { parent, position } of categories) {
      groups.set(parent ?? '', [...(groups.get(parent ?? '') ?? []), position]);
    }
    for (const positions of groups.values()) expect(new Set(positions).size).toBe(positions.length);
  });

  it('maps Open Food Facts tags written as they write them, each to one category', () => {
    const seen = new Map<string, string>();
    for (const { slug, offTags } of categories) {
      for (const tag of offTags) {
        expect(tag).toMatch(/^[a-z]{2}:[a-z0-9-]+$/);
        expect({ tag, alsoIn: seen.get(tag) }).toEqual({ tag, alsoIn: undefined });
        seen.set(tag, slug);
      }
    }
  });

  it('keeps the slugs products already use', () => {
    for (const slug of ['almacen', 'lacteos', 'leche', 'bebidas']) expect(bySlug.has(slug)).toBe(true);
  });
});
