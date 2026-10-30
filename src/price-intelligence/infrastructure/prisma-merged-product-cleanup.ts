import { Injectable } from '@nestjs/common';
import { IntelligencePrismaService } from '../../common/database/intelligence-prisma.service.js';
import type { MergedProductCleanup } from '../domain/merged-product-cleanup.port.js';

@Injectable()
export class PrismaMergedProductCleanup implements MergedProductCleanup {
  constructor(private readonly prisma: IntelligencePrismaService) {}

  async forget(productId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.derivedPrice.deleteMany({ where: { productId } }),
      this.prisma.dailyPriceHistory.deleteMany({ where: { productId } }),
      this.prisma.priceDrop.deleteMany({ where: { productId } }),
    ]);
  }
}
