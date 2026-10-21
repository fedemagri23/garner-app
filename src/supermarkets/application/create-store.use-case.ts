import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { slugify } from '../../common/text/normalize.js';
import { CommunityPolicy } from '../../community/application/community-policy.js';
import { CatalogOrigin } from '../../community/domain/catalog-origin.js';
import { COMMUNITY_REPOSITORY, type CommunityRepository } from '../../community/domain/community.port.js';
import { looksLikeSameStore, SAME_STORE_METRES } from '../../community/domain/duplicates.js';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import { boundingBox } from '../domain/geo.js';
import {
  DEFAULT_STORE_TIME_ZONE,
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
  /** The chain; or `supermarketName` for one not listed (shoppers only). */
  supermarketId?: string;
  supermarketName?: string;
  name: string;
  addressLine: string;
  city: string;
  province?: string;
  postalCode?: string;
  country: string;
  latitude: number;
  longitude: number;
  phone?: string;
  /** IANA zone; defaults to Buenos Aires, where the catalog started. */
  timeZone?: string;
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
    @Inject(COMMUNITY_REPOSITORY) private readonly community: CommunityRepository,
    private readonly policy: CommunityPolicy,
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

  /**
   * The team's shops are VERIFIED and public at once. A shopper's are
   * COMMUNITY and private to them until ten products are priced there
   * (`publicationProgress`); a shopper may add few a day, may name a chain
   * that is not listed, and is refused a shop that is already there — the
   * same chain within a few metres.
   */
  async createStore(command: CreateStoreCommand, actor: AuthenticatedUser): Promise<StoreLocation> {
    const fromTeam = actor.role === 'MODERATOR' || actor.role === 'ADMIN';
    if (!fromTeam) {
      await this.policy.assertMayCreate(actor.id, 'STORE');
    }

    const supermarket = await this.chainFor(command, actor, fromTeam);

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

    // The team curates its own; a shopper is stopped from adding a shop twice.
    if (!fromTeam) {
      const point = { latitude: command.latitude, longitude: command.longitude };
      const twin = (await this.community.storesWithin(boundingBox(point, (SAME_STORE_METRES * 2) / 1000))).find(
        (existing) => looksLikeSameStore({ ...point, supermarketId: supermarket.id }, existing),
      );
      if (twin) {
        // Someone else's private shop is not named: it is not anyone else's business yet.
        const visible = twin.publishedAt !== null || twin.createdById === actor.id;
        throw new ConflictException(
          visible ? `This shop is already here: ${twin.name}` : 'This shop has already been added',
        );
      }
    }

    const store = await this.stores.create({
      supermarketId: supermarket.id,
      name: command.name.trim(),
      addressLine: command.addressLine.trim(),
      city: command.city.trim(),
      province: command.province?.trim() ?? null,
      postalCode: command.postalCode?.trim() ?? null,
      country: command.country.trim(),
      latitude: command.latitude,
      longitude: command.longitude,
      phone: command.phone?.trim() ?? null,
      timeZone: command.timeZone ?? DEFAULT_STORE_TIME_ZONE,
      openingHours,
      origin: fromTeam ? CatalogOrigin.Verified : CatalogOrigin.Community,
      createdById: fromTeam ? null : actor.id,
    });

    if (!fromTeam) {
      await this.community.audit({ actorId: actor.id, action: 'created', targetType: 'STORE', targetId: store.id });
    }
    return store;
  }

  /** The chain a new shop belongs to: the one given, or one a shopper names. */
  private async chainFor(command: CreateStoreCommand, actor: AuthenticatedUser, fromTeam: boolean): Promise<Supermarket> {
    if (command.supermarketId) {
      const chain = await this.supermarkets.findById(command.supermarketId);
      if (!chain) {
        throw new NotFoundException('Supermarket not found');
      }
      return chain;
    }

    if (!command.supermarketName || fromTeam) {
      // The team adds chains on their own, with their details.
      throw new BadRequestException('supermarketId is required');
    }

    const slug = slugify(command.supermarketName);
    return (
      (await this.supermarkets.findBySlug(slug)) ??
      this.supermarkets.create({
        name: command.supermarketName.trim(),
        slug,
        logoUrl: null,
        websiteUrl: null,
        origin: CatalogOrigin.Community,
        createdById: actor.id,
      })
    );
  }
}
