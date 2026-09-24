import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module.js';
import { ProductsModule } from '../products/products.module.js';
import { SupermarketsModule } from '../supermarkets/supermarkets.module.js';
import { ManagePriceSourcesUseCase } from './application/manage-price-sources.use-case.js';
import { RunSourceImportUseCase } from './application/run-source-import.use-case.js';
import { ScheduleSourceImportsUseCase } from './application/schedule-source-imports.use-case.js';
import {
  EXTERNAL_PRICE_SOURCE_REPOSITORY,
  EXTERNAL_PRODUCT_LINK_REPOSITORY,
  EXTERNAL_STORE_LINK_REPOSITORY,
  IMPORT_RUN_REPOSITORY,
} from './domain/external-price-source.repository.port.js';
import { IMPORT_JOBS } from './domain/import-jobs.port.js';
import { ADAPTER_REGISTRY } from './domain/price-source-adapter.port.js';
import { InMemoryAdapterRegistry } from './infrastructure/adapter-registry.js';
import {
  BullmqImportJobs,
  EXTERNAL_IMPORTS_QUEUE,
  ExternalImportsProcessor,
} from './infrastructure/external-price-sources.queue.js';
import { JsonHttpAdapter } from './infrastructure/json-http.adapter.js';
import {
  PrismaExternalPriceSourceRepository,
  PrismaExternalProductLinkRepository,
  PrismaExternalStoreLinkRepository,
  PrismaImportRunRepository,
} from './infrastructure/prisma-external-price-source.repository.js';
import { SandboxFileAdapter } from './infrastructure/sandbox-file.adapter.js';
import { PriceSourcesController } from './presentation/price-sources.controller.js';

/**
 * Supermarket integrations: the registry, the adapters, and the daily import.
 *
 * Adding a supermarket means writing an adapter and registering a source. The
 * pricing domain does not change, because imported prices enter the same
 * ingestion pipeline as a shopper's report — as EXTERNAL_API observations.
 */
@Module({
  imports: [
    PricingModule,
    ProductsModule,
    SupermarketsModule,
    BullModule.registerQueue({ name: EXTERNAL_IMPORTS_QUEUE }),
  ],
  controllers: [PriceSourcesController],
  providers: [
    RunSourceImportUseCase,
    ScheduleSourceImportsUseCase,
    ManagePriceSourcesUseCase,
    ExternalImportsProcessor,
    JsonHttpAdapter,
    SandboxFileAdapter,
    { provide: ADAPTER_REGISTRY, useClass: InMemoryAdapterRegistry },
    { provide: IMPORT_JOBS, useClass: BullmqImportJobs },
    {
      provide: EXTERNAL_PRICE_SOURCE_REPOSITORY,
      useClass: PrismaExternalPriceSourceRepository,
    },
    { provide: IMPORT_RUN_REPOSITORY, useClass: PrismaImportRunRepository },
    {
      provide: EXTERNAL_PRODUCT_LINK_REPOSITORY,
      useClass: PrismaExternalProductLinkRepository,
    },
    {
      provide: EXTERNAL_STORE_LINK_REPOSITORY,
      useClass: PrismaExternalStoreLinkRepository,
    },
  ],
})
export class ExternalPriceSourcesModule {}
