import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../../products/domain/product.repository.port.js';
import {
  DAILY_PRICE_HISTORY_REPOSITORY,
  DERIVED_PRICE_REPOSITORY,
  type DailyPriceHistoryRepository,
  type DerivedPriceRepository,
} from '../domain/price-intelligence.repository.port.js';
import {
  HISTORY_RANGE_DAYS,
  mergeByDate,
  summarizeTrend,
  utcDay,
  type DailyPricePoint,
  type HistoryRange,
  type PriceTrend,
} from '../domain/price-history.js';

export interface PriceHistoryView {
  productId: string;
  storeId: string | null;
  range: HistoryRange;
  points: DailyPricePoint[];
  trend: PriceTrend | null;
  /** The current derived price, when a single store was asked about. */
  currentPriceCents: number | null;
}

/**
 * The price history screen: a daily series plus the summary above it —
 * what it usually costs, the best it has been, and which way it is moving.
 *
 * Always read from the daily aggregates, never from raw observations: the
 * observations behind a year of history no longer exist.
 */
@Injectable()
export class GetPriceHistoryUseCase {
  constructor(
    @Inject(DAILY_PRICE_HISTORY_REPOSITORY)
    private readonly history: DailyPriceHistoryRepository,
    @Inject(DERIVED_PRICE_REPOSITORY)
    private readonly derivedPrices: DerivedPriceRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
  ) {}

  async execute(query: {
    productId: string;
    storeId?: string;
    range: HistoryRange;
    now?: Date;
  }): Promise<PriceHistoryView> {
    if (!(await this.products.findById(query.productId))) {
      throw new NotFoundException('Product not found');
    }

    const now = query.now ?? new Date();
    const to = utcDay(now);
    const from = new Date(
      to.getTime() - HISTORY_RANGE_DAYS[query.range] * 24 * 60 * 60 * 1000,
    );

    const rows = await this.history.findRange({
      productId: query.productId,
      storeId: query.storeId,
      from,
      to: new Date(to.getTime() + 24 * 60 * 60 * 1000),
    });

    // Without a store the range holds one row per store per day, which is a
    // series of several lines; the product-wide view wants one.
    const points = query.storeId ? rows : mergeByDate(rows);

    const current = query.storeId
      ? await this.derivedPrices.find(query.productId, query.storeId)
      : null;

    return {
      productId: query.productId,
      storeId: query.storeId ?? null,
      range: query.range,
      points,
      trend: summarizeTrend(points),
      currentPriceCents: current?.priceCents ?? null,
    };
  }
}
