import { Injectable } from '@nestjs/common';
import type { Category as PrismaCategory } from '../../../generated/prisma/core/index.js';
import { CorePrismaService } from '../../common/database/core-prisma.service.js';
import type { Category } from '../domain/product.entity.js';
import type { CategoryRepository } from '../domain/product.repository.port.js';

@Injectable()
export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly prisma: CorePrismaService) {}

  async findAll(): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
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
  }): Promise<Category> {
    const row = await this.prisma.category.create({ data: input });
    return this.toDomain(row);
  }

  private toDomain(row: PrismaCategory): Category {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      parentId: row.parentId,
    };
  }
}
