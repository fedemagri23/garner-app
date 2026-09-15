import { Module } from '@nestjs/common';
import { BrowseSupermarketsUseCase } from './application/browse-supermarkets.use-case.js';
import { CreateStoreUseCase } from './application/create-store.use-case.js';
import { FindNearbyStoresUseCase } from './application/find-nearby-stores.use-case.js';
import { GetStoreUseCase } from './application/get-store.use-case.js';
import {
  STORE_LOCATION_REPOSITORY,
  SUPERMARKET_REPOSITORY,
} from './domain/supermarket.repository.port.js';
import { PrismaStoreLocationRepository } from './infrastructure/prisma-store-location.repository.js';
import { PrismaSupermarketRepository } from './infrastructure/prisma-supermarket.repository.js';
import { StoresController } from './presentation/stores.controller.js';
import { SupermarketsController } from './presentation/supermarkets.controller.js';

/**
 * Owns chains and their physical stores. Both ports are exported: pricing
 * records an observation against a store, and optimization routes between
 * them, so those phases read stores through this contract.
 */
@Module({
  controllers: [SupermarketsController, StoresController],
  providers: [
    BrowseSupermarketsUseCase,
    GetStoreUseCase,
    FindNearbyStoresUseCase,
    CreateStoreUseCase,
    { provide: SUPERMARKET_REPOSITORY, useClass: PrismaSupermarketRepository },
    {
      provide: STORE_LOCATION_REPOSITORY,
      useClass: PrismaStoreLocationRepository,
    },
  ],
  exports: [SUPERMARKET_REPOSITORY, STORE_LOCATION_REPOSITORY],
})
export class SupermarketsModule {}
