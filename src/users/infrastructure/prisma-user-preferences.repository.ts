import { Injectable } from '@nestjs/common';
import type { UserPreferences as PrismaUserPreferences } from '../../../generated/prisma/core/index.js';
import { CorePrismaService } from '../../common/database/core-prisma.service.js';
import { DEFAULT_SEARCH_RADIUS_KM } from '../domain/user-preferences.entity.js';
import type { UserPreferences } from '../domain/user-preferences.entity.js';
import type {
  UpdateUserPreferencesInput,
  UserPreferencesRepository,
} from '../domain/user-preferences.repository.port.js';

@Injectable()
export class PrismaUserPreferencesRepository implements UserPreferencesRepository {
  constructor(private readonly prisma: CorePrismaService) {}

  async findByUserId(userId: string): Promise<UserPreferences | null> {
    const row = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });

    return row ? this.toDomain(row) : null;
  }

  /**
   * One upsert rather than a read-then-write: the row is created on the user's
   * first save, and two concurrent saves cannot race into a duplicate.
   */
  async save(
    userId: string,
    input: UpdateUserPreferencesInput,
  ): Promise<UserPreferences> {
    const row = await this.prisma.userPreferences.upsert({
      where: { userId },
      create: {
        userId,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        locationLabel: input.locationLabel ?? null,
        searchRadiusKm: input.searchRadiusKm ?? DEFAULT_SEARCH_RADIUS_KM,
        interests: input.interests ?? [],
      },
      // Undefined fields are left untouched, which is the PATCH semantics the
      // controller promises; an explicit null clears the field.
      update: {
        latitude: input.latitude,
        longitude: input.longitude,
        locationLabel: input.locationLabel,
        searchRadiusKm: input.searchRadiusKm,
        interests: input.interests,
      },
    });

    return this.toDomain(row);
  }

  private toDomain(row: PrismaUserPreferences): UserPreferences {
    return {
      userId: row.userId,
      latitude: row.latitude,
      longitude: row.longitude,
      locationLabel: row.locationLabel,
      searchRadiusKm: row.searchRadiusKm,
      interests: row.interests,
    };
  }
}
