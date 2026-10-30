import { Injectable } from '@nestjs/common';
import { PricingPrismaService } from '../../common/database/pricing-prisma.service.js';
import type { ProductPriceMover } from '../domain/product-price-mover.port.js';

@Injectable()
export class PrismaProductPriceMover implements ProductPriceMover {
  constructor(private readonly prisma: PricingPrismaService) {}

  async move(from: string, into: string): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      const stores = await tx.priceObservation.findMany({
        where: { productId: from },
        select: { storeId: true },
        distinct: ['storeId'],
      });
      await tx.priceObservation.updateMany({ where: { productId: from }, data: { productId: into } });
      // Imports matched to the duplicate now feed the kept product.
      await tx.externalProductLink.updateMany({ where: { productId: from }, data: { productId: into } });
      return stores.map((row) => row.storeId);
    });
  }
}
