import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module.js';
import { ProductsModule } from '../products/products.module.js';
import { SupermarketsModule } from '../supermarkets/supermarkets.module.js';
import { AggregateDailyPricesUseCase } from './application/aggregate-daily-prices.use-case.js';
import { ComparePricesUseCase } from './application/compare-prices.use-case.js';
import { GetPriceHistoryUseCase } from './application/get-price-history.use-case.js';
import { ObservationAcceptedListener } from './application/observation-accepted.listener.js';
import { RecomputeDerivedPriceUseCase } from './application/recompute-derived-price.use-case.js';
import {
  DAILY_PRICE_HISTORY_REPOSITORY,
  DERIVED_PRICE_REPOSITORY,
  PRICE_CACHE,
} from './domain/price-intelligence.repository.port.js';
import { PrismaDailyPriceHistoryRepository } from './infrastructure/prisma-daily-price-history.repository.js';
import { PrismaDerivedPriceRepository } from './infrastructure/prisma-derived-price.repository.js';
import {
  PRICE_INTELLIGENCE_QUEUE,
  PriceIntelligenceJobs,
  PriceIntelligenceProcessor,
} from './infrastructure/price-intelligence.queue.js';
import { RedisPriceCache } from './infrastructure/redis-price-cache.js';
import { ProductPricesController } from './presentation/product-prices.controller.js';

/**
 * Turns raw observations into the prices the product actually shows: a current
 * derived price per product and store, and a compact daily history.
 *
 * It reads observations through pricing's port and owns `intelligence_db`.
 * Optimization (phase 7) and notifications (phase 8) consume the derived
 * prices exported here, never the raw observations.
 */
@Module({
  imports: [
    PricingModule,
    ProductsModule,
    SupermarketsModule,
    BullModule.registerQueue({ name: PRICE_INTELLIGENCE_QUEUE }),
  ],
  controllers: [ProductPricesController],
  providers: [
    RecomputeDerivedPriceUseCase,
    AggregateDailyPricesUseCase,
    ComparePricesUseCase,
    GetPriceHistoryUseCase,
    ObservationAcceptedListener,
    PriceIntelligenceJobs,
    PriceIntelligenceProcessor,
    { provide: DERIVED_PRICE_REPOSITORY, useClass: PrismaDerivedPriceRepository },
    {
      provide: DAILY_PRICE_HISTORY_REPOSITORY,
      useClass: PrismaDailyPriceHistoryRepository,
    },
    { provide: PRICE_CACHE, useClass: RedisPriceCache },
  ],
  exports: [DERIVED_PRICE_REPOSITORY, DAILY_PRICE_HISTORY_REPOSITORY],
})
export class PriceIntelligenceModule {}
