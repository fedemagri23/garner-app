import { Injectable } from '@nestjs/common';
import type { DailyPriceHistory as DailyPriceHistoryRow } from '../../../generated/prisma/intelligence/index.js';
import { IntelligencePrismaService } from '../../common/database/intelligence-prisma.service.js';
import type { DailyPriceRecord } from '../domain/derived-price.entity.js';
import type { DailyPricePoint } from '../domain/price-history.js';
import type { DailyPriceHistoryRepository } from '../domain/price-intelligence.repository.port.js';

/** A year of daily rows for one product across a handful of stores. */
const MAX_POINTS = 2_000;

@Injectable()
export class PrismaDailyPriceHistoryRepository
  implements DailyPriceHistoryRepository
{
  constructor(private readonly prisma: IntelligencePrismaService) {}

  async upsert(record: DailyPriceRecord): Promise<void> {
    const data = {
      currency: record.currency,
      weightedAverageCents: record.weightedAverageCents,
      minPriceCents: record.minPriceCents,
      maxPriceCents: record.maxPriceCents,
      observationCount: record.observationCount,
      confidence: record.confidence,
      isAnomalous: record.isAnomalous,
      computedAt: new Date(),
    };

    await this.prisma.dailyPriceHistory.upsert({
      where: {
        productId_storeId_date: {
          productId: record.productId,
          storeId: record.storeId,
          date: record.date,
        },
      },
      create: {
        productId: record.productId,
        storeId: record.storeId,
        date: record.date,
        ...data,
      },
      update: data,
    });
  }

  async findPreviousDay(
    productId: string,
    storeId: string,
    date: Date,
  ): Promise<DailyPriceRecord | null> {
    // The day before in the data, not the calendar: gaps are normal, and the
    // comparison should be against the last day anyone saw a price.
    const row = await this.prisma.dailyPriceHistory.findFirst({
      where: { productId, storeId, date: { lt: date } },
      orderBy: { date: 'desc' },
    });

    return row ? this.toRecord(row) : null;
  }

  async findRange(query: {
    productId: string;
    storeId?: string;
    from: Date;
    to: Date;
  }): Promise<DailyPricePoint[]> {
    const rows = await this.prisma.dailyPriceHistory.findMany({
      where: {
        productId: query.productId,
        ...(query.storeId ? { storeId: query.storeId } : {}),
        date: { gte: query.from, lt: query.to },
      },
      orderBy: { date: 'asc' },
      take: MAX_POINTS,
    });

    return rows.map((row) => ({
      date: row.date,
      weightedAverageCents: row.weightedAverageCents,
      minPriceCents: row.minPriceCents,
      maxPriceCents: row.maxPriceCents,
      observationCount: row.observationCount,
      confidence: row.confidence,
      isAnomalous: row.isAnomalous,
    }));
  }

  private toRecord(row: DailyPriceHistoryRow): DailyPriceRecord {
    return {
      productId: row.productId,
      storeId: row.storeId,
      date: row.date,
      currency: row.currency,
      weightedAverageCents: row.weightedAverageCents,
      minPriceCents: row.minPriceCents,
      maxPriceCents: row.maxPriceCents,
      observationCount: row.observationCount,
      confidence: row.confidence,
      isAnomalous: row.isAnomalous,
    };
  }
}
