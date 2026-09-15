import { Inject, Injectable } from '@nestjs/common';
import { boundingBox, haversineKm, type Coordinates } from '../domain/geo.js';
import { isOpenAt } from '../domain/opening-hours.js';
import type { NearbyStore } from '../domain/supermarket.entity.js';
import {
  STORE_LOCATION_REPOSITORY,
  type StoreLocationRepository,
} from '../domain/supermarket.repository.port.js';

export interface FindNearbyStoresQuery extends Coordinates {
  radiusKm: number;
  limit: number;
  supermarketId?: string;
}

/**
 * "Which stores can I actually shop at from here?" — the query behind the home
 * screen, and the input optimization will route from in phase 7.
 *
 * Two steps on purpose: the database narrows by bounding box using the
 * coordinate index, then the exact radius and ordering are applied here. The
 * box over-selects at its corners, so filtering afterwards is what makes the
 * radius mean a radius rather than a square.
 */
@Injectable()
export class FindNearbyStoresUseCase {
  constructor(
    @Inject(STORE_LOCATION_REPOSITORY)
    private readonly stores: StoreLocationRepository,
  ) {}

  async execute(query: FindNearbyStoresQuery): Promise<NearbyStore[]> {
    const centre: Coordinates = {
      latitude: query.latitude,
      longitude: query.longitude,
    };

    // Ask for more rows than requested: some of what the box returns falls
    // outside the circle, and dropping those must not leave the page short.
    const candidates = await this.stores.findWithinBox(
      boundingBox(centre, query.radiusKm),
      query.limit * 4,
    );

    const now = new Date();

    return candidates
      .filter(
        (store) =>
          !query.supermarketId || store.supermarketId === query.supermarketId,
      )
      .map((store) => ({
        store,
        distanceKm: haversineKm(centre, {
          latitude: store.latitude,
          longitude: store.longitude,
        }),
        isOpenNow: isOpenAt(store.openingHours, now),
      }))
      .filter((nearby) => nearby.distanceKm <= query.radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, query.limit);
  }
}
