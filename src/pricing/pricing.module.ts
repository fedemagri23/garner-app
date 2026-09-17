import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module.js';
import { SupermarketsModule } from '../supermarkets/supermarkets.module.js';
import { UsersModule } from '../users/users.module.js';
import { IngestPriceObservationService } from './application/ingest-price-observation.service.js';
import { PrunePriceObservationsUseCase } from './application/prune-price-observations.use-case.js';
import {
  PRICE_OBSERVATION_REPOSITORY,
  SUBMISSION_COUNTER,
} from './domain/price-observation.repository.port.js';
import {
  PRICING_MAINTENANCE_QUEUE,
  PricingMaintenanceProcessor,
} from './infrastructure/pricing-maintenance.processor.js';
import { PrismaPriceObservationRepository } from './infrastructure/prisma-price-observation.repository.js';
import { RedisSubmissionCounter } from './infrastructure/redis-submission-counter.js';

/**
 * Owns raw price observations in `pricing_db` and the one pipeline every price
 * enters through. It has no HTTP surface of its own: people submit prices
 * through contributions, and feeds (phase 6) will call the same service.
 */
@Module({
  imports: [
    ProductsModule,
    SupermarketsModule,
    UsersModule,
    BullModule.registerQueue({ name: PRICING_MAINTENANCE_QUEUE }),
  ],
  providers: [
    IngestPriceObservationService,
    PrunePriceObservationsUseCase,
    PricingMaintenanceProcessor,
    {
      provide: PRICE_OBSERVATION_REPOSITORY,
      useClass: PrismaPriceObservationRepository,
    },
    { provide: SUBMISSION_COUNTER, useClass: RedisSubmissionCounter },
  ],
  exports: [IngestPriceObservationService, PRICE_OBSERVATION_REPOSITORY],
})
export class PricingModule {}
