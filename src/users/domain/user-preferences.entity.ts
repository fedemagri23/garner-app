/**
 * Optional personalization, all of it skippable: onboarding asks for a
 * location and a few interests, and the product has to work for a user who
 * declines both.
 */
export interface UserPreferences {
  userId: string;
  /** Null until the user shares a location or types one in. */
  latitude: number | null;
  longitude: number | null;
  /** What the user called the place, e.g. "Home" or "Palermo". */
  locationLabel: string | null;
  /** How far a "nearby" store may be, in kilometres. */
  searchRadiusKm: number;
  /** Category slugs, validated against the catalog before they are stored. */
  interests: string[];
}

export const DEFAULT_SEARCH_RADIUS_KM = 5;

/** The widest radius a user may ask for; beyond this "nearby" stops meaning anything. */
export const MAX_SEARCH_RADIUS_KM = 50;

/**
 * What an account reads as before it has saved anything. Preferences are
 * created lazily, so registration does not have to know this table exists and
 * an account written before the table did still reads correctly.
 */
export function defaultPreferences(userId: string): UserPreferences {
  return {
    userId,
    latitude: null,
    longitude: null,
    locationLabel: null,
    searchRadiusKm: DEFAULT_SEARCH_RADIUS_KM,
    interests: [],
  };
}

/**
 * A location is a pair or it is nothing: a latitude without a longitude cannot
 * place a store search, so half a coordinate is rejected rather than stored.
 */
export function hasCompleteLocation(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  return (
    (latitude === null || latitude === undefined) ===
    (longitude === null || longitude === undefined)
  );
}
