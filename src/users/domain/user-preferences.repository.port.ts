import type { UserPreferences } from './user-preferences.entity.js';

/** The fields a user may change; anything omitted is left as it was. */
export interface UpdateUserPreferencesInput {
  latitude?: number | null;
  longitude?: number | null;
  locationLabel?: string | null;
  searchRadiusKm?: number;
  interests?: string[];
}

export interface UserPreferencesRepository {
  /** Null when the user has never saved preferences. */
  findByUserId(userId: string): Promise<UserPreferences | null>;
  /** Creates the row on first write, updates it afterwards. */
  save(
    userId: string,
    input: UpdateUserPreferencesInput,
  ): Promise<UserPreferences>;
}

export const USER_PREFERENCES_REPOSITORY = Symbol(
  'USER_PREFERENCES_REPOSITORY',
);
