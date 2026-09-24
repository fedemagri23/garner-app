import { estimateTravel, MINUTES_PER_STOP } from './travel.js';

const home = { latitude: -34.6037, longitude: -58.3816 };

const stop = (storeId: string, latitude: number, longitude: number) => ({
  storeId,
  latitude,
  longitude,
});

describe('estimateTravel', () => {
  it('is nothing when there is nowhere to go', () => {
    expect(estimateTravel(home, [])).toEqual({
      distanceKm: 0,
      minutes: 0,
      storeOrder: [],
    });
  });

  it('counts the trip home again', () => {
    const oneStop = estimateTravel(home, [stop('a', -34.6137, -58.3816)]);

    // ~1.1 km each way.
    expect(oneStop.distanceKm).toBeGreaterThan(2);
    expect(oneStop.distanceKm).toBeLessThan(2.4);
  });

  it('visits the nearest store first', () => {
    const route = estimateTravel(home, [
      stop('far', -34.7037, -58.3816),
      stop('near', -34.6137, -58.3816),
    ]);

    expect(route.storeOrder).toEqual(['near', 'far']);
  });

  it('gives the same route whatever order the stores arrive in', () => {
    const stops = [
      stop('a', -34.6137, -58.3816),
      stop('b', -34.6237, -58.3816),
      stop('c', -34.6337, -58.3816),
    ];

    expect(estimateTravel(home, stops)).toEqual(
      estimateTravel(home, [...stops].reverse()),
    );
  });

  it('charges time for each stop as well as the driving', () => {
    const one = estimateTravel(home, [stop('a', -34.6047, -58.3826)]);
    const two = estimateTravel(home, [
      stop('a', -34.6047, -58.3826),
      stop('b', -34.6048, -58.3827),
    ]);

    expect(two.minutes - one.minutes).toBeGreaterThanOrEqual(MINUTES_PER_STOP);
  });
});
