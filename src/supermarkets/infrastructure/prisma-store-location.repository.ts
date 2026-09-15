import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/core/index.js';
import { CorePrismaService } from '../../common/database/core-prisma.service.js';
import type { BoundingBox } from '../domain/geo.js';
import type {
  CreateStoreLocationInput,
  StoreLocation,
} from '../domain/supermarket.entity.js';
import type {
  StoreLocationRepository,
  StoreSearchCriteria,
  StoreSearchResult,
} from '../domain/supermarket.repository.port.js';

const STORE_INCLUDE = {
  supermarket: true,
  openingHours: { orderBy: [{ dayOfWeek: 'asc' }, { opensAt: 'asc' }] },
} satisfies Prisma.StoreLocationInclude;

type StoreRow = Prisma.StoreLocationGetPayload<{
  include: typeof STORE_INCLUDE;
}>;

@Injectable()
export class PrismaStoreLocationRepository implements StoreLocationRepository {
  constructor(private readonly prisma: CorePrismaService) {}

  async search(criteria: StoreSearchCriteria): Promise<StoreSearchResult> {
    const where: Prisma.StoreLocationWhereInput = {
      ...(criteria.includeInactive ? {} : { isActive: true }),
      ...(criteria.supermarketId
        ? { supermarketId: criteria.supermarketId }
        : {}),
      ...(criteria.city
        ? { city: { equals: criteria.city, mode: 'insensitive' } }
        : {}),
    };

    const [rows, totalItems] = await Promise.all([
      this.prisma.storeLocation.findMany({
        where,
        include: STORE_INCLUDE,
        orderBy: [{ city: 'asc' }, { name: 'asc' }],
        skip: criteria.skip,
        take: criteria.take,
      }),
      this.prisma.storeLocation.count({ where }),
    ]);

    return { stores: rows.map((row) => this.toDomain(row)), totalItems };
  }

  async findById(id: string): Promise<StoreLocation | null> {
    const row = await this.prisma.storeLocation.findUnique({
      where: { id },
      include: STORE_INCLUDE,
    });

    return row ? this.toDomain(row) : null;
  }

  async findManyByIds(ids: string[]): Promise<StoreLocation[]> {
    if (ids.length === 0) {
      return [];
    }

    const rows = await this.prisma.storeLocation.findMany({
      where: { id: { in: ids } },
      include: STORE_INCLUDE,
    });

    return rows.map((row) => this.toDomain(row));
  }

  /**
   * Range predicates on both coordinates, which is what the composite
   * `(latitude, longitude)` index is there to serve. The exact radius is the
   * caller's job — see FindNearbyStoresUseCase.
   */
  async findWithinBox(
    box: BoundingBox,
    limit: number,
  ): Promise<StoreLocation[]> {
    const rows = await this.prisma.storeLocation.findMany({
      where: {
        isActive: true,
        latitude: { gte: box.minLatitude, lte: box.maxLatitude },
        longitude: { gte: box.minLongitude, lte: box.maxLongitude },
      },
      include: STORE_INCLUDE,
      take: limit,
    });

    return rows.map((row) => this.toDomain(row));
  }

  async create(input: CreateStoreLocationInput): Promise<StoreLocation> {
    const row = await this.prisma.storeLocation.create({
      data: {
        supermarketId: input.supermarketId,
        name: input.name,
        addressLine: input.addressLine,
        city: input.city,
        province: input.province,
        postalCode: input.postalCode,
        country: input.country,
        latitude: input.latitude,
        longitude: input.longitude,
        phone: input.phone,
        openingHours: {
          create: input.openingHours.map((interval) => ({
            dayOfWeek: interval.dayOfWeek,
            opensAt: interval.opensAt,
            closesAt: interval.closesAt,
          })),
        },
      },
      include: STORE_INCLUDE,
    });

    return this.toDomain(row);
  }

  private toDomain(row: StoreRow): StoreLocation {
    return {
      id: row.id,
      supermarketId: row.supermarketId,
      supermarket: {
        id: row.supermarket.id,
        name: row.supermarket.name,
        slug: row.supermarket.slug,
        logoUrl: row.supermarket.logoUrl,
      },
      name: row.name,
      addressLine: row.addressLine,
      city: row.city,
      province: row.province,
      postalCode: row.postalCode,
      country: row.country,
      latitude: row.latitude,
      longitude: row.longitude,
      phone: row.phone,
      isActive: row.isActive,
      openingHours: row.openingHours.map((hours) => ({
        dayOfWeek: hours.dayOfWeek,
        opensAt: hours.opensAt,
        closesAt: hours.closesAt,
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
