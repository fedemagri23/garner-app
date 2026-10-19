import { Injectable } from '@nestjs/common';
import type { PriceDrop as PriceDropRow } from '../../../generated/prisma/intelligence/index.js';
import { IntelligencePrismaService } from '../../common/database/intelligence-prisma.service.js';
import type { PriceDrop } from '../domain/price-drop.js';
import type { PriceDropRepository } from '../domain/price-intelligence.repository.port.js';

@Injectable()
export class PrismaPriceDropRepository implements PriceDropRepository {
  constructor(private readonly prisma: IntelligencePrismaService) {}

  async find(productId: string, storeId: string): Promise<PriceDrop | null> {
    const row = await this.prisma.priceDrop.findUnique({
      where: { productId_storeId: { productId, storeId } },
    });

    return row ? this.toDomain(row) : null;
  }

  async upsert(drop: PriceDrop): Promise<void> {
    const data = {
      currency: drop.currency,
      priceCents: drop.priceCents,
      previousPriceCents: drop.previousPriceCents,
      droppedAt: drop.droppedAt,
    };

    await this.prisma.priceDrop.upsert({
      where: {
        productId_storeId: { productId: drop.productId, storeId: drop.storeId },
      },
      create: { productId: drop.productId, storeId: drop.storeId, ...data },
      update: data,
    });
  }

  async remove(productId: string, storeId: string): Promise<void> {
    await this.prisma.priceDrop.deleteMany({ where: { productId, storeId } });
  }

  async findRecentAtStores(query: {
    storeIds: string[];
    since: Date;
    limit: number;
  }): Promise<PriceDrop[]> {
    if (query.storeIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.priceDrop.findMany({
      where: { storeId: { in: query.storeIds }, droppedAt: { gte: query.since } },
      orderBy: { droppedAt: 'desc' },
      take: query.limit,
    });

    return rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: PriceDropRow): PriceDrop {
    return {
      productId: row.productId,
      storeId: row.storeId,
      currency: row.currency,
      priceCents: row.priceCents,
      previousPriceCents: row.previousPriceCents,
      droppedAt: row.droppedAt,
    };
  }
}
