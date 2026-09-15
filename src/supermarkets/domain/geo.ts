/**
 * The geometry behind "stores near me".
 *
 * There is no PostGIS in this stack, and adding one for a proximity search
 * would be infrastructure the phase does not need. Instead the repository
 * filters on a latitude/longitude bounding box — which the composite index on
 * `store_locations` serves — and the exact distance is computed here, on the
 * handful of rows that box returns.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface BoundingBox {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

const EARTH_RADIUS_KM = 6371;
const KM_PER_DEGREE_LATITUDE = 111.32;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in kilometres. Accurate to well under a percent at
 * city scale, which is the only scale that matters for choosing a store.
 */
export function haversineKm(from: Coordinates, to: Coordinates): number {
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(deltaLon / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * The smallest latitude/longitude rectangle containing every point within
 * `radiusKm` of `centre`. It over-selects — corners of the box are further
 * away than the radius — which is why callers still filter by exact distance.
 */
export function boundingBox(
  centre: Coordinates,
  radiusKm: number,
): BoundingBox {
  const latitudeDelta = radiusKm / KM_PER_DEGREE_LATITUDE;

  // A degree of longitude shrinks towards the poles; near ±90° the cosine
  // collapses, so the box is widened to the whole range rather than divided by
  // something approaching zero.
  const cosine = Math.cos(toRadians(centre.latitude));
  const longitudeDelta =
    Math.abs(cosine) < 1e-6
      ? 180
      : radiusKm / (KM_PER_DEGREE_LATITUDE * Math.abs(cosine));

  return {
    minLatitude: Math.max(-90, centre.latitude - latitudeDelta),
    maxLatitude: Math.min(90, centre.latitude + latitudeDelta),
    minLongitude: Math.max(-180, centre.longitude - longitudeDelta),
    maxLongitude: Math.min(180, centre.longitude + longitudeDelta),
  };
}
