import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PriceIntelligenceModule } from '../price-intelligence/price-intelligence.module.js';
import { ProductsModule } from '../products/products.module.js';
import { ShoppingListsModule } from '../shopping-lists/shopping-lists.module.js';
import { SupermarketsModule } from '../supermarkets/supermarkets.module.js';
import { OptimizationPreferencesUseCase } from './application/optimization-preferences.use-case.js';
import { OptimizationViewBuilder } from './application/optimization-view.js';
import { RequestOptimizationUseCase } from './application/request-optimization.use-case.js';
import { RunOptimizationUseCase } from './application/run-optimization.use-case.js';
import {
  OPTIMIZATION_JOBS,
  OPTIMIZATION_PREFERENCES_REPOSITORY,
  OPTIMIZATION_REQUEST_REPOSITORY,
} from './domain/optimization.repository.port.js';
import {
  BullmqOptimizationJobs,
  OPTIMIZATION_QUEUE,
  OptimizationProcessor,
} from './infrastructure/optimization.queue.js';
import {
  PrismaOptimizationPreferencesRepository,
  PrismaOptimizationRequestRepository,
} from './infrastructure/prisma-optimization.repository.js';
import { OptimizationController } from './presentation/optimization.controller.js';

/**
 * Turns a shopping list into a plan for buying it.
 *
 * Reads lists, stores and derived prices through the ports the owning modules
 * export — never raw observations — and does the search in a worker, so a
 * shopper never waits on it.
 */
@Module({
  imports: [
    ShoppingListsModule,
    SupermarketsModule,
    ProductsModule,
    PriceIntelligenceModule,
    BullModule.registerQueue({ name: OPTIMIZATION_QUEUE }),
  ],
  controllers: [OptimizationController],
  providers: [
    RequestOptimizationUseCase,
    RunOptimizationUseCase,
    OptimizationPreferencesUseCase,
    OptimizationViewBuilder,
    OptimizationProcessor,
    { provide: OPTIMIZATION_JOBS, useClass: BullmqOptimizationJobs },
    {
      provide: OPTIMIZATION_PREFERENCES_REPOSITORY,
      useClass: PrismaOptimizationPreferencesRepository,
    },
    {
      provide: OPTIMIZATION_REQUEST_REPOSITORY,
      useClass: PrismaOptimizationRequestRepository,
    },
  ],
})
export class OptimizationModule {}
