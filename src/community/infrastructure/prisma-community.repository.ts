import { Injectable } from '@nestjs/common';
import { CorePrismaService } from '../../common/database/core-prisma.service.js';
import type { ModerationStatus } from '../domain/catalog-origin.js';
import type {
  AuditEntry,
  CommunityRepository,
  FlagReason,
  FlagTarget,
  NearbyStore,
  ProductSignals,
  ReviewItem,
  SimilarProduct,
  Standing,
  StoreStanding,
} from '../domain/community.port.js';

const REMOVED: ModerationStatus[] = ['HIDDEN', 'UNDER_REVIEW'];

/** Unique-constraint violation: the row was already there. */
const isDuplicate = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';

@Injectable()
export class PrismaCommunityRepository implements CommunityRepository {
  constructor(private readonly prisma: CorePrismaService) {}

  async standing(userId: string): Promise<Standing> {
    const [user, acceptedContributions, removedProducts, removedStores] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
      this.prisma.storePriceContributor.count({ where: { userId } }),
      this.prisma.product.count({ where: { createdById: userId, moderationStatus: { in: REMOVED } } }),
      this.prisma.storeLocation.count({ where: { createdById: userId, moderationStatus: { in: REMOVED } } }),
    ]);

    return {
      accountCreatedAt: user?.createdAt ?? new Date(),
      acceptedContributions,
      removedEntries: removedProducts + removedStores,
    };
  }

  countCreatedSince(target: FlagTarget, userId: string, since: Date): Promise<number> {
    const where = { createdById: userId, createdAt: { gte: since } };
    return target === 'PRODUCT'
      ? this.prisma.product.count({ where })
      : this.prisma.storeLocation.count({ where });
  }

  countFlagsSince(userId: string, since: Date): Promise<number> {
    return this.prisma.contentFlag.count({ where: { userId, createdAt: { gte: since } } });
  }

  async productsNamed(normalizedName: string, limit: number): Promise<SimilarProduct[]> {
    const rows = await this.prisma.product.findMany({
      where: { normalizedName, isActive: true, moderationStatus: 'ACTIVE' },
      orderBy: { weight: 'desc' },
      take: limit,
    });
    return rows.map((row) => this.similar(row));
  }

  async productsLike(normalizedText: string, limit: number): Promise<SimilarProduct[]> {
    const rows = await this.prisma.product.findMany({
      where: { normalizedName: { contains: normalizedText }, isActive: true, moderationStatus: 'ACTIVE' },
      orderBy: [{ weight: 'desc' }, { normalizedName: 'asc' }],
      take: limit,
    });
    return rows.map((row) => this.similar(row));
  }

  async storesWithin(box: {
    minLatitude: number;
    maxLatitude: number;
    minLongitude: number;
    maxLongitude: number;
  }): Promise<NearbyStore[]> {
    const rows = await this.prisma.storeLocation.findMany({
      where: {
        isActive: true,
        moderationStatus: { in: ['ACTIVE', 'UNDER_REVIEW'] },
        latitude: { gte: box.minLatitude, lte: box.maxLatitude },
        longitude: { gte: box.minLongitude, lte: box.maxLongitude },
      },
      take: 200,
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      supermarketId: row.supermarketId,
      latitude: row.latitude,
      longitude: row.longitude,
      createdById: row.createdById,
      publishedAt: row.publishedAt,
    }));
  }

  async confirm(productId: string, userId: string): Promise<boolean> {
    try {
      await this.prisma.productConfirmation.create({ data: { productId, userId } });
      return true;
    } catch (error) {
      if (isDuplicate(error)) return false;
      throw error;
    }
  }

  async unconfirm(productId: string, userId: string): Promise<boolean> {
    const { count } = await this.prisma.productConfirmation.deleteMany({ where: { productId, userId } });
    return count > 0;
  }

  async flag(target: FlagTarget, targetId: string, userId: string, reason: FlagReason): Promise<boolean> {
    try {
      await this.prisma.contentFlag.create({ data: { targetType: target, targetId, userId, reason } });
      return true;
    } catch (error) {
      if (isDuplicate(error)) return false;
      throw error;
    }
  }

  async flaggers(target: FlagTarget, targetId: string): Promise<string[]> {
    const rows = await this.prisma.contentFlag.findMany({
      where: { targetType: target, targetId },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  async recordContribution(storeId: string, productId: string, userId: string): Promise<boolean> {
    try {
      await this.prisma.storePriceContributor.create({
        data: { storeLocationId: storeId, productId, userId },
      });
      return true;
    } catch (error) {
      if (isDuplicate(error)) return false;
      throw error;
    }
  }

  async storeCounts(storeId: string): Promise<{ pricedProducts: number; contributors: number }> {
    const [products, people] = await Promise.all([
      this.prisma.storePriceContributor.groupBy({ by: ['productId'], where: { storeLocationId: storeId } }),
      this.prisma.storePriceContributor.groupBy({ by: ['userId'], where: { storeLocationId: storeId } }),
    ]);
    return { pricedProducts: products.length, contributors: people.length };
  }

  async productSignals(productId: string, pricedSince: Date): Promise<ProductSignals | null> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { origin: true, createdById: true, lastActivityAt: true },
    });
    if (!product) return null;

    // The creator vouching for, or pricing, their own entry adds nothing.
    const notCreator = product.createdById ? { not: product.createdById } : undefined;
    const [confirmingUsers, pricing, flaggingUsers] = await Promise.all([
      this.prisma.productConfirmation.count({ where: { productId, userId: notCreator } }),
      this.prisma.storePriceContributor.groupBy({
        by: ['userId'],
        where: { productId, userId: notCreator, firstAcceptedAt: { gte: pricedSince } },
      }),
      this.prisma.contentFlag.count({ where: { targetType: 'PRODUCT', targetId: productId } }),
    ]);

    return {
      origin: product.origin,
      createdById: product.createdById,
      confirmingUsers,
      recentPricingUsers: pricing.length,
      flaggingUsers,
      lastActivityAt: product.lastActivityAt,
    };
  }

  storeStanding(storeId: string): Promise<StoreStanding | null> {
    return this.prisma.storeLocation.findUnique({
      where: { id: storeId },
      select: { origin: true, createdById: true, publishedAt: true, moderationStatus: true },
    });
  }

  async saveProductStanding(
    productId: string,
    standing: { weight: number; confirmationCount: number; flagCount: number; lastActivityAt: Date | null },
  ): Promise<void> {
    await this.prisma.product.update({ where: { id: productId }, data: standing });
  }

  async saveStoreProgress(
    storeId: string,
    progress: { pricedProductCount: number; contributorCount: number; publishedAt?: Date },
  ): Promise<void> {
    await this.prisma.storeLocation.update({ where: { id: storeId }, data: progress });
  }

  async setStoreFlagCount(storeId: string, flagCount: number): Promise<void> {
    await this.prisma.storeLocation.update({ where: { id: storeId }, data: { flagCount } });
  }

  async setModeration(
    target: FlagTarget,
    id: string,
    status: ModerationStatus,
    extra: { verified?: boolean } = {},
  ): Promise<boolean> {
    const origin = extra.verified ? { origin: 'VERIFIED' as const } : {};

    if (target === 'PRODUCT') {
      const { count } = await this.prisma.product.updateMany({
        where: { id },
        data: { moderationStatus: status, ...origin },
      });
      return count > 0;
    }

    const store = await this.prisma.storeLocation.findUnique({ where: { id }, select: { publishedAt: true } });
    if (!store) return false;
    await this.prisma.storeLocation.update({
      where: { id },
      data: {
        moderationStatus: status,
        ...origin,
        // A shop the team vouches for is visible from then on.
        ...(extra.verified && !store.publishedAt ? { publishedAt: new Date() } : {}),
      },
    });
    return true;
  }

  async reviewQueue(limit: number): Promise<ReviewItem[]> {
    const needsLook = {
      OR: [{ moderationStatus: 'UNDER_REVIEW' as const }, { flagCount: { gt: 0 }, moderationStatus: 'ACTIVE' as const }],
    };
    const [products, stores] = await Promise.all([
      this.prisma.product.findMany({ where: needsLook, orderBy: { flagCount: 'desc' }, take: limit }),
      this.prisma.storeLocation.findMany({ where: needsLook, orderBy: { flagCount: 'desc' }, take: limit }),
    ]);

    return [
      ...products.map((row) => ({
        targetType: 'PRODUCT' as const,
        id: row.id,
        name: row.name,
        moderationStatus: row.moderationStatus,
        flagCount: row.flagCount,
        confirmationCount: row.confirmationCount,
        createdAt: row.createdAt,
      })),
      ...stores.map((row) => ({
        targetType: 'STORE' as const,
        id: row.id,
        name: row.name,
        moderationStatus: row.moderationStatus,
        flagCount: row.flagCount,
        confirmationCount: 0,
        createdAt: row.createdAt,
      })),
    ]
      // What flags pulled first, then the most flagged.
      .sort(
        (a, b) =>
          Number(b.moderationStatus === 'UNDER_REVIEW') - Number(a.moderationStatus === 'UNDER_REVIEW') ||
          b.flagCount - a.flagCount,
      )
      .slice(0, limit);
  }

  async audit(entry: AuditEntry): Promise<void> {
    await this.prisma.catalogAuditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        note: entry.note ?? null,
      },
    });
  }

  private similar(row: {
    id: string;
    name: string;
    normalizedName: string;
    brandId: string | null;
    packageSize: { toNumber(): number } | null;
    unit: string;
  }): SimilarProduct {
    return {
      id: row.id,
      name: row.name,
      normalizedName: row.normalizedName,
      brandId: row.brandId,
      packageSize: row.packageSize === null ? null : Number(row.packageSize),
      unit: row.unit,
    };
  }
}
