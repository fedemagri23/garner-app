import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { StoreLocation } from '../domain/supermarket.entity.js';
import {
  STORE_LOCATION_REPOSITORY,
  type StoreLocationRepository,
  type StoreSearchResult,
} from '../domain/supermarket.repository.port.js';

@Injectable()
export class GetStoreUseCase {
  constructor(
    @Inject(STORE_LOCATION_REPOSITORY)
    private readonly stores: StoreLocationRepository,
  ) {}

  async execute(id: string): Promise<StoreLocation> {
    const store = await this.stores.findById(id);

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    return store;
  }

  listStores(criteria: {
    supermarketId?: string;
    city?: string;
    skip: number;
    take: number;
  }): Promise<StoreSearchResult> {
    return this.stores.search(criteria);
  }
}
