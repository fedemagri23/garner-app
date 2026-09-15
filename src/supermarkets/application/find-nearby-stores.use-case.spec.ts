import type { StoreLocation } from '../domain/supermarket.entity.js';
import type { StoreLocationRepository } from '../domain/supermarket.repository.port.js';
import { FindNearbyStoresUseCase } from './find-nearby-stores.use-case.js';

const obelisco = { latitude: -34.6037, longitude: -58.3816 };

const store = (
  id: string,
  latitude: number,
  longitude: number,
  supermarketId = 'chain-1',
): StoreLocation => ({
  id,
  supermarketId,
  supermarket: {
    id: supermarketId,
    name: 'Chain',
    slug: 'chain',
    logoUrl: null,
  },
  name: id,
  addressLine: 'Somewhere 123',
  city: 'Buenos Aires',
  province: null,
  postalCode: null,
  country: 'AR',
  latitude,
  longitude,
  phone: null,
  isActive: true,
  openingHours: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('FindNearbyStoresUseCase', () => {
  let stores: jest.Mocked<StoreLocationRepository>;
  let useCase: FindNearbyStoresUseCase;

  const near = store('near', -34.6047, -58.3826); // ~140 m away
  const far = store('far', -34.7037, -58.3816); // ~11 km away

  beforeEach(() => {
    stores = {
      search: jest.fn(),
      findById: jest.fn(),
      findManyByIds: jest.fn(),
      findWithinBox: jest.fn().mockResolvedValue([far, near]),
      create: jest.fn(),
    };

    useCase = new FindNearbyStoresUseCase(stores);
  });

  it('drops candidates the bounding box included but the radius excludes', async () => {
    const result = await useCase.execute({
      ...obelisco,
      radiusKm: 1,
      limit: 10,
    });

    expect(result.map((nearby) => nearby.store.id)).toEqual(['near']);
  });

  it('orders by distance, nearest first', async () => {
    const result = await useCase.execute({
      ...obelisco,
      radiusKm: 20,
      limit: 10,
    });

    expect(result.map((nearby) => nearby.store.id)).toEqual(['near', 'far']);
    expect(result[0].distanceKm).toBeLessThan(result[1].distanceKm);
  });

  it('over-fetches so the radius filter cannot leave the page short', async () => {
    await useCase.execute({ ...obelisco, radiusKm: 5, limit: 10 });

    expect(stores.findWithinBox).toHaveBeenCalledWith(expect.anything(), 40);
  });

  it('narrows to one chain when asked', async () => {
    stores.findWithinBox.mockResolvedValue([
      near,
      store('other-chain', -34.6047, -58.3827, 'chain-2'),
    ]);

    const result = await useCase.execute({
      ...obelisco,
      radiusKm: 5,
      limit: 10,
      supermarketId: 'chain-2',
    });

    expect(result.map((nearby) => nearby.store.id)).toEqual(['other-chain']);
  });

  it('caps the result at the requested limit', async () => {
    stores.findWithinBox.mockResolvedValue([
      near,
      store('near-2', -34.6048, -58.3827),
      store('near-3', -34.6049, -58.3828),
    ]);

    const result = await useCase.execute({
      ...obelisco,
      radiusKm: 5,
      limit: 2,
    });

    expect(result).toHaveLength(2);
  });

  it('reports a store with no hours on record as closed', async () => {
    const [nearby] = await useCase.execute({
      ...obelisco,
      radiusKm: 5,
      limit: 1,
    });

    expect(nearby.isOpenNow).toBe(false);
  });
});
