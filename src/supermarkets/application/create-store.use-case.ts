import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { slugify } from '../../common/text/normalize.js';
import {
  parseWallClock,
  type OpeningInterval,
} from '../domain/opening-hours.js';
import type {
  StoreLocation,
  Supermarket,
} from '../domain/supermarket.entity.js';
import {
  STORE_LOCATION_REPOSITORY,
  SUPERMARKET_REPOSITORY,
  type StoreLocationRepository,
  type SupermarketRepository,
} from '../domain/supermarket.repository.port.js';

export interface CreateSupermarketCommand {
  name: string;
  logoUrl?: string;
  websiteUrl?: string;
}

export interface CreateStoreCommand {
  supermarketId: string;
  name: string;
  addressLine: string;
  city: string;
  province?: string;
  postalCode?: string;
  country: string;
  latitude: number;
  longitude: number;
  phone?: string;
  openingHours?: OpeningInterval[];
}

/**
 * Curated writes for the store catalog. Coordinates are checked here rather
 * than only at the DTO because a store placed at the wrong point silently
 * corrupts every proximity search and every optimized route that follows.
 */
@Injectable()
export class CreateStoreUseCase {
  constructor(
    @Inject(SUPERMARKET_REPOSITORY)
    private readonly supermarkets: SupermarketRepository,
    @Inject(STORE_LOCATION_REPOSITORY)
    private readonly stores: StoreLocationRepository,
  ) {}

  async createSupermarket(
    command: CreateSupermarketCommand,
  ): Promise<Supermarket> {
    const slug = slugify(command.name);

    if (await this.supermarkets.findBySlug(slug)) {
      throw new ConflictException(
        'A supermarket with this name already exists',
      );
    }

    return this.supermarkets.create({
      name: command.name.trim(),
      slug,
      logoUrl: command.logoUrl ?? null,
      websiteUrl: command.websiteUrl ?? null,
    });
  }

  async createStore(command: CreateStoreCommand): Promise<StoreLocation> {
    const supermarket = await this.supermarkets.findById(command.supermarketId);

    if (!supermarket) {
      throw new NotFoundException('Supermarket not found');
    }

    const openingHours = command.openingHours ?? [];

    for (const interval of openingHours) {
      if (
        parseWallClock(interval.opensAt) === null ||
        parseWallClock(interval.closesAt) === null
      ) {
        throw new BadRequestException(
          'Opening hours must be wall-clock times of the form HH:MM',
        );
      }
    }

    return this.stores.create({
      supermarketId: command.supermarketId,
      name: command.name.trim(),
      addressLine: command.addressLine.trim(),
      city: command.city.trim(),
      province: command.province?.trim() ?? null,
      postalCode: command.postalCode?.trim() ?? null,
      country: command.country.trim(),
      latitude: command.latitude,
      longitude: command.longitude,
      phone: command.phone?.trim() ?? null,
      openingHours,
    });
  }
}
