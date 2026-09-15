import { Injectable } from '@nestjs/common';
import type { Supermarket as PrismaSupermarket } from '../../../generated/prisma/core/index.js';
import { CorePrismaService } from '../../common/database/core-prisma.service.js';
import type {
  CreateSupermarketInput,
  Supermarket,
} from '../domain/supermarket.entity.js';
import type { SupermarketRepository } from '../domain/supermarket.repository.port.js';

@Injectable()
export class PrismaSupermarketRepository implements SupermarketRepository {
  constructor(private readonly prisma: CorePrismaService) {}

  async findAll(includeInactive: boolean): Promise<Supermarket[]> {
    const rows = await this.prisma.supermarket.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });

    return rows.map((row) => this.toDomain(row));
  }

  async findById(id: string): Promise<Supermarket | null> {
    const row = await this.prisma.supermarket.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findBySlug(slug: string): Promise<Supermarket | null> {
    const row = await this.prisma.supermarket.findUnique({ where: { slug } });
    return row ? this.toDomain(row) : null;
  }

  async create(input: CreateSupermarketInput): Promise<Supermarket> {
    const row = await this.prisma.supermarket.create({ data: input });
    return this.toDomain(row);
  }

  private toDomain(row: PrismaSupermarket): Supermarket {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      logoUrl: row.logoUrl,
      websiteUrl: row.websiteUrl,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
