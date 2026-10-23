import { Injectable } from '@nestjs/common';
import type { Category as PrismaCategory } from '../../../generated/prisma/core/index.js';
import { CorePrismaService } from '../../common/database/core-prisma.service.js';
import { asTranslations, type Translations } from '../../common/i18n/language.js';

/** Stored synonyms, keeping only lists of words. */
function asSynonyms(value: unknown): Partial<Record<string, string[]>> {
  if (typeof value !== 'object' || value === null) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]))
      .map(([language, words]) => [language, words.filter((word): word is string => typeof word === 'string')]),
  );
}
import type { Category } from '../domain/product.entity.js';
import type { CategoryRepository } from '../domain/product.repository.port.js';

@Injectable()
export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly prisma: CorePrismaService) {}

  async findAll(): Promise<Category[]> {
    // Retired categories stay for the products that still point at them, but
    // are not offered.
    const rows = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });

    return rows.map((row) => this.toDomain(row));
  }

  async findById(id: string): Promise<Category | null> {
    const row = await this.prisma.category.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findBySlug(slug: string): Promise<Category | null> {
    const row = await this.prisma.category.findUnique({ where: { slug } });
    return row ? this.toDomain(row) : null;
  }

  async findBySlugs(slugs: string[]): Promise<Category[]> {
    if (slugs.length === 0) {
      return [];
    }

    const rows = await this.prisma.category.findMany({
      where: { slug: { in: slugs } },
    });

    return rows.map((row) => this.toDomain(row));
  }

  /**
   * The category and everything filed beneath it, walked level by level.
   *
   * A recursive CTE would be one query, but the tree is small (a browsable
   * category list is tens of rows, not thousands) and it is read far more often
   * than it changes — so the readable version wins until a profile says
   * otherwise.
   */
  async findSubtreeIds(id: string): Promise<string[]> {
    const collected = [id];
    let frontier = [id];

    while (frontier.length > 0) {
      const children = await this.prisma.category.findMany({
        where: { parentId: { in: frontier } },
        select: { id: true },
      });

      frontier = children
        .map((child) => child.id)
        // Guards against a cycle introduced by bad data: without this a
        // parent pointing at its own descendant would loop forever.
        .filter((childId) => !collected.includes(childId));

      collected.push(...frontier);
    }

    return collected;
  }

  async create(input: {
    name: string;
    slug: string;
    parentId: string | null;
    translations?: Translations;
  }): Promise<Category> {
    const row = await this.prisma.category.create({ data: { ...input, translations: input.translations ?? {} } });
    return this.toDomain(row);
  }

  private toDomain(row: PrismaCategory): Category {
    return {
      id: row.id,
      name: row.name,
      translations: asTranslations(row.translations),
      slug: row.slug,
      parentId: row.parentId,
      position: row.position,
      synonyms: asSynonyms(row.synonyms),
      offTags: Array.isArray(row.offTags) ? row.offTags.filter((tag): tag is string => typeof tag === 'string') : [],
    };
  }
}
