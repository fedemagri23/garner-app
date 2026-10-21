import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
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

  /**
   * A shop, if the asker may see it: a private shop is its creator's (and the
   * team's) alone, and to anyone else it does not exist.
   */
  async execute(id: string, actor: AuthenticatedUser): Promise<StoreLocation> {
    const store = await this.stores.findById(id);
    const team = actor.role === 'MODERATOR' || actor.role === 'ADMIN';

    if (!store || !(store.isPublic || store.createdById === actor.id || team)) {
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
