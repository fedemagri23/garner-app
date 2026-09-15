import { boundingBox, haversineKm } from './geo.js';

const obelisco = { latitude: -34.6037, longitude: -58.3816 };
const laPlata = { latitude: -34.9215, longitude: -57.9545 };

describe('haversineKm', () => {
  it('is zero for a point against itself', () => {
    expect(haversineKm(obelisco, obelisco)).toBe(0);
  });

  it('matches the known distance between two cities', () => {
    // Buenos Aires to La Plata is about 53 km as the crow flies.
    expect(haversineKm(obelisco, laPlata)).toBeCloseTo(53, 0);
  });

  it('is symmetric', () => {
    expect(haversineKm(obelisco, laPlata)).toBeCloseTo(
      haversineKm(laPlata, obelisco),
      9,
    );
  });
});

describe('boundingBox', () => {
  it('contains every point inside the radius', () => {
    const box = boundingBox(obelisco, 5);
    const dueNorth = {
      latitude: obelisco.latitude + 0.04,
      longitude: obelisco.longitude,
    };

    expect(haversineKm(obelisco, dueNorth)).toBeLessThan(5);
    expect(dueNorth.latitude).toBeLessThanOrEqual(box.maxLatitude);
    expect(dueNorth.latitude).toBeGreaterThanOrEqual(box.minLatitude);
  });

  it('widens longitude as latitude increases, since degrees narrow there', () => {
    const equator = boundingBox({ latitude: 0, longitude: 0 }, 10);
    const far = boundingBox({ latitude: 60, longitude: 0 }, 10);

    const width = (box: { minLongitude: number; maxLongitude: number }) =>
      box.maxLongitude - box.minLongitude;

    expect(width(far)).toBeGreaterThan(width(equator));
  });

  it('stays within valid coordinates at the pole', () => {
    const box = boundingBox({ latitude: 90, longitude: 0 }, 50);

    expect(box.maxLatitude).toBeLessThanOrEqual(90);
    expect(box.minLongitude).toBeGreaterThanOrEqual(-180);
    expect(box.maxLongitude).toBeLessThanOrEqual(180);
  });
});
