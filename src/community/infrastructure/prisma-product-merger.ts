import { Injectable } from '@nestjs/common';
import { CorePrismaService } from '../../common/database/core-prisma.service.js';
import type { MergeOutcome, ProductMerger } from '../domain/product-merge.port.js';

/**
 * One transaction over the core database. It reaches into tables other
 * modules own (lists, trips, alerts…) on purpose: a merge must be all or
 * nothing (CON-066). Prices live in other databases and follow by events.
 */
@Injectable()
export class PrismaProductMerger implements ProductMerger {
  constructor(private readonly prisma: CorePrismaService) {}

  async merge(from: string, into: string): Promise<MergeOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const [source, kept] = await Promise.all([
        tx.product.findUnique({ where: { id: from }, select: { moderationStatus: true } }),
        tx.product.findUnique({ where: { id: into }, select: { moderationStatus: true, isActive: true } }),
      ]);
      if (!source || !kept) return 'not-found';
      if (from === into || source.moderationStatus === 'MERGED' || kept.moderationStatus !== 'ACTIVE' || !kept.isActive) {
        return 'invalid';
      }

      // Barcodes are unique on their own; the kept product keeps its primary.
      const keptHasPrimary = (await tx.productBarcode.count({ where: { productId: into, isPrimary: true } })) > 0;
      await tx.productBarcode.updateMany({
        where: { productId: from },
        data: { productId: into, ...(keptHasPrimary ? { isPrimary: false } : {}) },
      });

      // A list with both products keeps one line, with both quantities.
      const lines = await tx.shoppingListItem.findMany({ where: { productId: from } });
      for (const line of lines) {
        const twin = await tx.shoppingListItem.findFirst({ where: { listId: line.listId, productId: into } });
        if (twin) {
          await tx.shoppingListItem.update({
            where: { id: twin.id },
            data: { quantity: Number(twin.quantity) + Number(line.quantity) },
          });
          await tx.shoppingListItem.delete({ where: { id: line.id } });
        } else {
          await tx.shoppingListItem.update({ where: { id: line.id }, data: { productId: into } });
        }
      }

      await tx.shoppingSessionItem.updateMany({ where: { productId: from }, data: { productId: into } });
      await tx.priceAlert.updateMany({ where: { productId: from }, data: { productId: into } });
      await tx.notification.updateMany({ where: { productId: from }, data: { productId: into } });

      // One word per person: what they said about both counts once.
      const confirmedKept = (
        await tx.productConfirmation.findMany({ where: { productId: into }, select: { userId: true } })
      ).map((row) => row.userId);
      await tx.productConfirmation.deleteMany({ where: { productId: from, userId: { in: confirmedKept } } });
      await tx.productConfirmation.updateMany({ where: { productId: from }, data: { productId: into } });

      const flaggedKept = (
        await tx.contentFlag.findMany({ where: { targetType: 'PRODUCT', targetId: into }, select: { userId: true } })
      ).map((row) => row.userId);
      await tx.contentFlag.deleteMany({ where: { targetType: 'PRODUCT', targetId: from, userId: { in: flaggedKept } } });
      await tx.contentFlag.updateMany({ where: { targetType: 'PRODUCT', targetId: from }, data: { targetId: into } });

      const contributions = await tx.storePriceContributor.findMany({ where: { productId: from } });
      for (const row of contributions) {
        const exists = await tx.storePriceContributor.findFirst({
          where: { storeLocationId: row.storeLocationId, productId: into, userId: row.userId },
        });
        if (exists) await tx.storePriceContributor.delete({ where: { id: row.id } });
        else await tx.storePriceContributor.update({ where: { id: row.id }, data: { productId: into } });
      }

      await tx.product.update({
        where: { id: from },
        data: { moderationStatus: 'MERGED', mergedIntoId: into, isActive: false },
      });
      return 'merged';
    });
  }
}
