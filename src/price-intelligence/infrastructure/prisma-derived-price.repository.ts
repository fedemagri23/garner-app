import { Injectable } from '@nestjs/common';
import type { DerivedPrice as DerivedPriceRow } from '../../../generated/prisma/intelligence/index.js';
import { IntelligencePrismaService } from '../../common/database/intelligence-prisma.service.js';
import type { DerivedPrice } from '../domain/derived-price.entity.js';
import type { PriceConfidenceLevel } from '../domain/price-confidence.js';
import type { DerivedPriceRepository } from '../domain/price-intelligence.repository.port.js';

@Injectable()
export class PrismaDerivedPriceRepository implements DerivedPriceRepository {
  constructor(private readonly prisma: IntelligencePrismaService) {}

  async find(productId: string, storeId: string): Promise<DerivedPrice | null> {
    const row = await this.prisma.derivedPrice.findUnique({
      where: { productId_storeId: { productId, storeId } },
    });

    return row ? this.toDomain(row) : null;
  }

  async findForProduct(productId: string): Promise<DerivedPrice[]> {
    const rows = await this.prisma.derivedPrice.findMany({
      where: { productId },
      orderBy: { priceCents: 'asc' },
    });

    return rows.map((row) => this.toDomain(row));
  }

  async findForProductAtStores(
    productId: string,
    storeIds: string[],
  ): Promise<DerivedPrice[]> {
    if (storeIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.derivedPrice.findMany({
      where: { productId, storeId: { in: storeIds } },
      orderBy: { priceCents: 'asc' },
    });

    return rows.map((row) => this.toDomain(row));
  }

  async upsert(price: DerivedPrice): Promise<void> {
    const data = {
      currency: price.currency,
      priceCents: price.priceCents,
      minPriceCents: price.minPriceCents,
      maxPriceCents: price.maxPriceCents,
      confidence: price.confidence,
      confidenceLevel: price.confidenceLevel,
      observationCount: price.observationCount,
      lastObservedAt: price.lastObservedAt,
      computedAt: price.computedAt,
    };

    await this.prisma.derivedPrice.upsert({
      where: {
        productId_storeId: {
          productId: price.productId,
          storeId: price.storeId,
        },
      },
      create: { productId: price.productId, storeId: price.storeId, ...data },
      update: data,
    });
  }

  async remove(productId: string, storeId: string): Promise<void> {
    await this.prisma.derivedPrice.deleteMany({ where: { productId, storeId } });
  }

  private toDomain(row: DerivedPriceRow): DerivedPrice {
    return {
      productId: row.productId,
      storeId: row.storeId,
      currency: row.currency,
      priceCents: row.priceCents,
      minPriceCents: row.minPriceCents,
      maxPriceCents: row.maxPriceCents,
      confidence: row.confidence,
      confidenceLevel: row.confidenceLevel as PriceConfidenceLevel,
      observationCount: row.observationCount,
      lastObservedAt: row.lastObservedAt,
      computedAt: row.computedAt,
    };
  }
}
