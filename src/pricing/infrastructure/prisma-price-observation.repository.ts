import { Injectable } from '@nestjs/common';
import type { PriceObservation as PriceObservationRow } from '../../../generated/prisma/pricing/index.js';
import { isUniqueViolation } from '../../common/database/prisma-errors.js';
import { PricingPrismaService } from '../../common/database/pricing-prisma.service.js';
import type {
  NewPriceObservation,
  PriceObservation,
  PriceObservationStatus,
  PriceSourceType,
  ReviewReason,
} from '../domain/price-observation.entity.js';
import type {
  AggregationTarget,
  PriceObservationRepository,
  PriceSampleQuery,
} from '../domain/price-observation.repository.port.js';

/** The only code that touches `price_observations`. */
@Injectable()
export class PrismaPriceObservationRepository
  implements PriceObservationRepository
{
  constructor(private readonly prisma: PricingPrismaService) {}

  async findById(id: string): Promise<PriceObservation | null> {
    const row = await this.prisma.priceObservation.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByDedupeKey(dedupeKey: string): Promise<PriceObservation | null> {
    const row = await this.prisma.priceObservation.findUnique({
      where: { dedupeKey },
    });
    return row ? this.toDomain(row) : null;
  }

  async findRecentDuplicate(input: {
    userId: string;
    productId: string;
    storeId: string;
    priceCents: number;
    currency: string;
    since: Date;
  }): Promise<PriceObservation | null> {
    const row = await this.prisma.priceObservation.findFirst({
      where: {
        userId: input.userId,
        productId: input.productId,
        storeId: input.storeId,
        priceCents: input.priceCents,
        currency: input.currency,
        receivedAt: { gte: input.since },
      },
      orderBy: { receivedAt: 'desc' },
    });

    return row ? this.toDomain(row) : null;
  }

  async recentAcceptedPrices(query: PriceSampleQuery): Promise<number[]> {
    const rows = await this.prisma.priceObservation.findMany({
      where: {
        productId: query.productId,
        ...(query.storeId ? { storeId: query.storeId } : {}),
        currency: query.currency,
        status: 'ACCEPTED',
        observedAt: { gte: query.since },
      },
      select: { priceCents: true },
      orderBy: { observedAt: 'desc' },
      take: query.limit,
    });

    return rows.map((row) => row.priceCents);
  }

  async countByUserWithReasonSince(
    userId: string,
    reasons: ReviewReason[],
    since: Date,
  ): Promise<number> {
    return this.prisma.priceObservation.count({
      where: {
        userId,
        receivedAt: { gte: since },
        reviewReasons: { hasSome: reasons },
      },
    });
  }

  async findByUser(
    userId: string,
    page: { skip: number; take: number },
  ): Promise<{ observations: PriceObservation[]; totalItems: number }> {
    const where = { userId };

    const [rows, totalItems] = await Promise.all([
      this.prisma.priceObservation.findMany({
        where,
        orderBy: [{ receivedAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.priceObservation.count({ where }),
    ]);

    return { observations: rows.map((row) => this.toDomain(row)), totalItems };
  }

  async create(
    observation: NewPriceObservation,
  ): Promise<{ observation: PriceObservation; created: boolean }> {
    try {
      const row = await this.prisma.priceObservation.create({
        data: {
          id: observation.id,
          productId: observation.productId,
          storeId: observation.storeId,
          priceCents: observation.priceCents,
          currency: observation.currency,
          observedAt: observation.observedAt,
          sourceType: observation.sourceType,
          status: observation.status,
          reviewReasons: observation.reviewReasons,
          userId: observation.userId,
          shoppingSessionId: observation.shoppingSessionId,
          dedupeKey: observation.dedupeKey,
          evidencePhotoKey: observation.evidencePhotoKey,
          evidenceNote: observation.evidenceNote,
        },
      });

      return { observation: this.toDomain(row), created: true };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      // A retry raced its original through the replay check; whichever
      // identity collided, the stored row is the answer.
      const existing =
        (observation.id ? await this.findById(observation.id) : null) ??
        (observation.dedupeKey
          ? await this.findByDedupeKey(observation.dedupeKey)
          : null);

      if (!existing) {
        throw error;
      }

      return { observation: existing, created: false };
    }
  }

  async findInWindow(query: {
    productId: string;
    storeId: string;
    from: Date;
    to: Date;
    limit: number;
  }): Promise<PriceObservation[]> {
    const rows = await this.prisma.priceObservation.findMany({
      where: {
        productId: query.productId,
        storeId: query.storeId,
        observedAt: { gte: query.from, lt: query.to },
      },
      orderBy: { observedAt: 'desc' },
      take: query.limit,
    });

    return rows.map((row) => this.toDomain(row));
  }

  async listAggregationTargets(query: {
    from: Date;
    to: Date;
    skip: number;
    take: number;
  }): Promise<AggregationTarget[]> {
    // Grouped in the database: a day can hold far more observations than
    // product/store pairs, and only the pairs need to travel.
    const groups = await this.prisma.priceObservation.groupBy({
      by: ['productId', 'storeId', 'currency'],
      where: { observedAt: { gte: query.from, lt: query.to } },
      orderBy: [
        { productId: 'asc' },
        { storeId: 'asc' },
        { currency: 'asc' },
      ],
      skip: query.skip,
      take: query.take,
    });

    return groups.map((group) => ({
      productId: group.productId,
      storeId: group.storeId,
      currency: group.currency,
    }));
  }

  /**
   * Batched by id so one run holds no long lock and does bounded work; the
   * retention job calls it repeatedly until a batch comes back short.
   */
  async deleteReceivedBefore(cutoff: Date, limit: number): Promise<number> {
    const batch = await this.prisma.priceObservation.findMany({
      where: { receivedAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { receivedAt: 'asc' },
      take: limit,
    });

    if (batch.length === 0) {
      return 0;
    }

    const { count } = await this.prisma.priceObservation.deleteMany({
      where: { id: { in: batch.map((row) => row.id) } },
    });

    return count;
  }

  private toDomain(row: PriceObservationRow): PriceObservation {
    return {
      id: row.id,
      productId: row.productId,
      storeId: row.storeId,
      priceCents: row.priceCents,
      currency: row.currency,
      observedAt: row.observedAt,
      receivedAt: row.receivedAt,
      sourceType: row.sourceType as PriceSourceType,
      status: row.status as PriceObservationStatus,
      reviewReasons: row.reviewReasons as ReviewReason[],
      userId: row.userId,
      shoppingSessionId: row.shoppingSessionId,
      dedupeKey: row.dedupeKey,
      evidencePhotoKey: row.evidencePhotoKey,
      evidenceNote: row.evidenceNote,
    };
  }
}
