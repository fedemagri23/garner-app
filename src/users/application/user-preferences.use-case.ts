import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  CATEGORY_REPOSITORY,
  type CategoryRepository,
} from '../../products/domain/product.repository.port.js';
import {
  defaultPreferences,
  hasCompleteLocation,
  MAX_SEARCH_RADIUS_KM,
  type UserPreferences,
} from '../domain/user-preferences.entity.js';
import {
  USER_PREFERENCES_REPOSITORY,
  type UpdateUserPreferencesInput,
  type UserPreferencesRepository,
} from '../domain/user-preferences.repository.port.js';

/**
 * Reads and writes the caller's own preferences.
 *
 * Interests are category slugs, and they are checked against the catalog
 * before being stored — through the products module's CATEGORY_REPOSITORY
 * port, never its tables. Preferences belong to the users domain and
 * categories to products, which is why the link is a validated slug rather
 * than a foreign key welding the two schemas together.
 */
@Injectable()
export class UserPreferencesUseCase {
  constructor(
    @Inject(USER_PREFERENCES_REPOSITORY)
    private readonly preferences: UserPreferencesRepository,
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: CategoryRepository,
  ) {}

  async get(userId: string): Promise<UserPreferences> {
    // An account that has never saved preferences is not an error — it is a
    // user who skipped onboarding, and they read as the documented defaults.
    return (
      (await this.preferences.findByUserId(userId)) ??
      defaultPreferences(userId)
    );
  }

  async update(
    userId: string,
    input: UpdateUserPreferencesInput,
  ): Promise<UserPreferences> {
    const current = await this.get(userId);

    // Validate the location as it will end up, not as it arrived: clearing one
    // half of a coordinate in a PATCH has to fail just as supplying one half does.
    const latitude =
      input.latitude === undefined ? current.latitude : input.latitude;
    const longitude =
      input.longitude === undefined ? current.longitude : input.longitude;

    if (!hasCompleteLocation(latitude, longitude)) {
      throw new BadRequestException(
        'A location needs both latitude and longitude, or neither',
      );
    }

    if (
      input.searchRadiusKm !== undefined &&
      (input.searchRadiusKm <= 0 || input.searchRadiusKm > MAX_SEARCH_RADIUS_KM)
    ) {
      throw new BadRequestException(
        `searchRadiusKm must be between 0 and ${MAX_SEARCH_RADIUS_KM}`,
      );
    }

    if (input.interests) {
      await this.assertKnownCategories(input.interests);
    }

    return this.preferences.save(userId, input);
  }

  private async assertKnownCategories(slugs: string[]): Promise<void> {
    const unique = [...new Set(slugs)];

    if (unique.length === 0) {
      return;
    }

    const known = await this.categories.findBySlugs(unique);
    const knownSlugs = new Set(known.map((category) => category.slug));
    const unknown = unique.filter((slug) => !knownSlugs.has(slug));

    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown interest categories: ${unknown.join(', ')}`,
      );
    }
  }
}
