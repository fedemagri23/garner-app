import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import type {
  PriceComparison,
  StorePriceView,
} from '../application/compare-prices.use-case.js';
import type { PriceHistoryView } from '../application/get-price-history.use-case.js';
import { PriceConfidenceLevel } from '../domain/price-confidence.js';
import {
  HistoryRange,
  type DailyPricePoint,
  type PriceTrend,
} from '../domain/price-history.js';

const CONFIDENCE_LEVELS = Object.values(PriceConfidenceLevel);
const HISTORY_RANGES = Object.values(HistoryRange);

export class StorePriceResponse {
  @ApiProperty({ format: 'uuid' }) storeId!: string;
  @ApiProperty() storeName!: string;
  @ApiProperty() supermarketName!: string;
  @ApiProperty({ description: 'Derived current price, in minor units (cents)' })
  priceCents!: number;
  @ApiProperty({ example: 'ARS' }) currency!: string;
  @ApiProperty({
    enum: CONFIDENCE_LEVELS,
    description: 'How far the price can be relied on',
  })
  confidence!: PriceConfidenceLevel;
  @ApiProperty({ description: 'Observations behind the price' })
  observationCount!: number;
  @ApiProperty({ format: 'date-time' }) lastObservedAt!: string;
  @ApiProperty({ nullable: true, description: 'Null when no location was given' })
  distanceKm!: number | null;
  @ApiProperty() isOpenNow!: boolean;

  static from(view: StorePriceView): StorePriceResponse {
    return {
      storeId: view.store.id,
      storeName: view.store.name,
      supermarketName: view.store.supermarket.name,
      priceCents: view.price.priceCents,
      currency: view.price.currency,
      confidence: view.price.confidenceLevel,
      observationCount: view.price.observationCount,
      lastObservedAt: view.price.lastObservedAt.toISOString(),
      distanceKm: view.distanceKm,
      isOpenNow: view.isOpenNow,
    };
  }
}

export class PriceComparisonResponse {
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty({
    type: [StorePriceResponse],
    description: 'Cheapest first',
  })
  prices!: StorePriceResponse[];
  @ApiProperty({ nullable: true, description: 'Cheapest price found, in cents' })
  lowestPriceCents!: number | null;

  static from(comparison: PriceComparison): PriceComparisonResponse {
    const prices = comparison.prices.map(StorePriceResponse.from);

    return {
      productId: comparison.product.id,
      productName: comparison.product.name,
      prices,
      lowestPriceCents: prices[0]?.priceCents ?? null,
    };
  }
}

export class DailyPricePointResponse {
  @ApiProperty({ example: '2026-09-22' }) date!: string;
  @ApiProperty() averageCents!: number;
  @ApiProperty() minPriceCents!: number;
  @ApiProperty() maxPriceCents!: number;
  @ApiProperty() observationCount!: number;
  @ApiProperty({ description: 'The day moved sharply against the one before it' })
  isAnomalous!: boolean;

  static from(point: DailyPricePoint): DailyPricePointResponse {
    return {
      date: point.date.toISOString().slice(0, 10),
      averageCents: point.weightedAverageCents,
      minPriceCents: point.minPriceCents,
      maxPriceCents: point.maxPriceCents,
      observationCount: point.observationCount,
      isAnomalous: point.isAnomalous,
    };
  }
}

export class PriceTrendResponse {
  @ApiProperty() averageCents!: number;
  @ApiProperty() lowestCents!: number;
  @ApiProperty() highestCents!: number;
  @ApiProperty({ description: 'Percent change across the range' })
  changePercent!: number;
  @ApiProperty({ enum: ['up', 'down', 'stable'] })
  direction!: PriceTrend['direction'];

  static from(trend: PriceTrend): PriceTrendResponse {
    return { ...trend };
  }
}

export class PriceHistoryResponse {
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty({ format: 'uuid', nullable: true }) storeId!: string | null;
  @ApiProperty({ enum: HISTORY_RANGES }) range!: HistoryRange;
  @ApiProperty({ type: [DailyPricePointResponse], description: 'Oldest first' })
  points!: DailyPricePointResponse[];
  @ApiProperty({ type: PriceTrendResponse, nullable: true })
  trend!: PriceTrendResponse | null;
  @ApiProperty({
    nullable: true,
    description: 'Current derived price; only when a store was named',
  })
  currentPriceCents!: number | null;

  static from(view: PriceHistoryView): PriceHistoryResponse {
    return {
      productId: view.productId,
      storeId: view.storeId,
      range: view.range,
      points: view.points.map(DailyPricePointResponse.from),
      trend: view.trend ? PriceTrendResponse.from(view.trend) : null,
      currentPriceCents: view.currentPriceCents,
    };
  }
}

export class ComparePricesQueryDto {
  @ApiPropertyOptional({ example: -34.6037, description: 'With longitude, limits to nearby stores' })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: -58.3816 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ default: 5, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Max(50)
  radiusKm: number = 5;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}

export class PriceHistoryQueryDto {
  @ApiPropertyOptional({ enum: HISTORY_RANGES, default: '30d' })
  @IsOptional()
  @IsEnum(HISTORY_RANGES)
  range: HistoryRange = HistoryRange.Days30;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'One store; omitted, the history covers every store',
  })
  @IsOptional()
  @IsUUID()
  storeId?: string;
}
