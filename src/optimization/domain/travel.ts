import { haversineKm, type Coordinates } from '../../supermarkets/domain/geo.js';

/**
 * What a shopping trip costs in travel.
 *
 * Straight-line distances and a flat urban speed, deliberately: a routing
 * service would be more accurate and is a dependency this phase does not need,
 * and the numbers here are only ever compared against each other. What matters
 * is that two stores across town rank worse than two on the same street.
 */

/** Average city driving speed, including lights and parking. */
export const AVERAGE_SPEED_KMH = 25;

/** Time spent inside a shop, beyond getting there. */
export const MINUTES_PER_STOP = 12;

export interface StopLocation extends Coordinates {
  storeId: string;
}

export interface TravelEstimate {
  /** Home → every stop in order → home. */
  distanceKm: number;
  minutes: number;
  /** The order the stops are visited in. */
  storeOrder: string[];
}

/**
 * Orders the stops nearest-first from home, then estimates the round trip.
 *
 * Nearest-neighbour rather than an exact tour: with the two or three stops a
 * shopper will accept, it is almost always the optimal order, and it stays
 * predictable — the same stores always produce the same route.
 */
export function estimateTravel(
  home: Coordinates,
  stops: StopLocation[],
): TravelEstimate {
  if (stops.length === 0) {
    return { distanceKm: 0, minutes: 0, storeOrder: [] };
  }

  const remaining = [...stops];
  const order: StopLocation[] = [];
  let position: Coordinates = home;
  let distanceKm = 0;

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const [index, stop] of remaining.entries()) {
      const distance = haversineKm(position, stop);

      // Ties break on store id, so the route never depends on input order.
      if (
        distance < nearestDistance ||
        (distance === nearestDistance &&
          stop.storeId < remaining[nearestIndex].storeId)
      ) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }

    const [next] = remaining.splice(nearestIndex, 1);
    distanceKm += nearestDistance;
    position = next;
    order.push(next);
  }

  distanceKm += haversineKm(position, home);

  return {
    distanceKm: round(distanceKm),
    minutes: Math.round(
      (distanceKm / AVERAGE_SPEED_KMH) * 60 + stops.length * MINUTES_PER_STOP,
    ),
    storeOrder: order.map((stop) => stop.storeId),
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
