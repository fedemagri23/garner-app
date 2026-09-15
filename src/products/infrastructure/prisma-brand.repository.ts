import { Injectable } from '@nestjs/common';
import type { Brand as PrismaBrand } from '../../../generated/prisma/core/index.js';
import { CorePrismaService } from '../../common/database/core-prisma.service.js';
import type { Brand } from '../domain/product.entity.js';
import type { BrandRepository } from '../domain/product.repository.port.js';

@Injectable()
export class PrismaBrandRepository implements BrandRepository {
  constructor(private readonly prisma: CorePrismaService) {}

  async findAll(): Promise<Brand[]> {
    const rows = await this.prisma.brand.findMany({ orderBy: { name: 'asc' } });
    return rows.map((row) => this.toDomain(row));
  }

  async findById(id: string): Promise<Brand | null> {
    const row = await this.prisma.brand.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findBySlug(slug: string): Promise<Brand | null> {
    const row = await this.prisma.brand.findUnique({ where: { slug } });
    return row ? this.toDomain(row) : null;
  }

  async create(input: {
    name: string;
    normalizedName: string;
    slug: string;
  }): Promise<Brand> {
    const row = await this.prisma.brand.create({ data: input });
    return this.toDomain(row);
  }

  private toDomain(row: PrismaBrand): Brand {
    return { id: row.id, name: row.name, slug: row.slug };
  }
}
