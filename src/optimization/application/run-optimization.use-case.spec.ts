import type { EventBus } from '../../common/events/event-bus.js';
import type { DerivedPrice } from '../../price-intelligence/domain/derived-price.entity.js';
import type { DerivedPriceRepository } from '../../price-intelligence/domain/price-intelligence.repository.port.js';
import type { ShoppingList } from '../../shopping-lists/domain/shopping-list.entity.js';
import type { ShoppingListRepository } from '../../shopping-lists/domain/shopping-list.repository.port.js';
import type { StoreLocation } from '../../supermarkets/domain/supermarket.entity.js';
import type { StoreLocationRepository } from '../../supermarkets/domain/supermarket.repository.port.js';
import type { OptimizationRequest } from '../domain/optimization-request.entity.js';
import type { OptimizationRequestRepository } from '../domain/optimization.repository.port.js';
import { RunOptimizationUseCase } from './run-optimization.use-case.js';

const home = { latitude: -34.6037, longitude: -58.3816 };

const request: OptimizationRequest = {
  id: 'request-1',
  ownerId: 'user-1',
  listId: 'list-1',
  settings: {
    ...home,
    radiusKm: 10,
    maxStores: 2,
    maxAdditionalDistanceKm: 20,
    maxAdditionalMinutes: 120,
    minSavingsCentsPerExtraStore: 0,
    mode: 'CHEAPEST',
    preferredSupermarketIds: [],
    excludedSupermarketIds: [],
  },
  status: 'PENDING',
  fingerprint: 'abc',
  requestedAt: new Date(),
  startedAt: null,
  completedAt: null,
  error: null,
  result: null,
};

const store = (id: string, kmAway: number): StoreLocation =>
  ({
    id,
    supermarketId: `chain-${id}`,
    supermarket: { id: `chain-${id}`, name: id, slug: id, logoUrl: null },
    name: id,
    latitude: home.latitude - kmAway / 111.32,
    longitude: home.longitude,
    isActive: true,
    openingHours: [],
  }) as unknown as StoreLocation;

const price = (
  productId: string,
  storeId: string,
  priceCents: number,
): DerivedPrice =>
  ({ productId, storeId, priceCents, currency: 'ARS' }) as DerivedPrice;

describe('RunOptimizationUseCase', () => {
  let requests: {
    findById: jest.Mock;
    claim: jest.Mock;
    complete: jest.Mock;
    fail: jest.Mock;
    release: jest.Mock;
  };
  let lists: { findById: jest.Mock };
  let stores: { findWithinBox: jest.Mock };
  let prices: { findForProductsAtStores: jest.Mock };
  let events: { publish: jest.Mock };
  let useCase: RunOptimizationUseCase;

  const list: ShoppingList = {
    id: 'list-1',
    ownerId: 'user-1',
    items: [
      { productId: 'milk', quantity: 1 },
      { productId: 'bread', quantity: 2 },
    ],
  } as unknown as ShoppingList;

  beforeEach(() => {
    requests = {
      findById: jest.fn().mockResolvedValue(request),
      claim: jest.fn().mockResolvedValue(true),
      complete: jest
        .fn()
        .mockImplementation(async (id, outcome) => ({
          ...request,
          id,
          status: 'COMPLETED',
          result: outcome.result,
        })),
      fail: jest
        .fn()
        .mockImplementation(async (id, error) => ({
          ...request,
          id,
          status: 'FAILED',
          error,
        })),
      release: jest.fn(),
    };
    lists = { findById: jest.fn().mockResolvedValue(list) };
    stores = {
      findWithinBox: jest.fn().mockResolvedValue([store('a', 1), store('b', 2)]),
    };
    prices = {
      findForProductsAtStores: jest
        .fn()
        .mockResolvedValue([
          price('milk', 'a', 100),
          price('bread', 'a', 300),
          price('milk', 'b', 200),
          price('bread', 'b', 100),
        ]),
    };
    events = { publish: jest.fn() };

    useCase = new RunOptimizationUseCase(
      requests as unknown as OptimizationRequestRepository,
      lists as unknown as ShoppingListRepository,
      stores as unknown as StoreLocationRepository,
      prices as unknown as DerivedPriceRepository,
      events as unknown as EventBus,
    );
  });

  it('computes a plan from derived prices and stores the result', async () => {
    const outcome = await useCase.execute('request-1');

    expect(outcome.kind).toBe('completed');

    const stored = requests.complete.mock.calls[0][1];
    // Milk at 100 from a, two bread at 100 from b.
    expect(stored.recommendedTotalCents).toBe(300);
    expect(stored.result.cheapest.stores).toHaveLength(2);
  });

  it('reads prices in one query for the whole list', async () => {
    await useCase.execute('request-1');

    expect(prices.findForProductsAtStores).toHaveBeenCalledTimes(1);
    expect(prices.findForProductsAtStores).toHaveBeenCalledWith(
      ['milk', 'bread'],
      ['a', 'b'],
    );
  });

  it('announces the result with the recommendation for the chosen mode', async () => {
    await useCase.execute('request-1');

    expect(events.publish.mock.calls[0][0]).toMatchObject({
      name: 'OptimizationCompleted',
      payload: { requestId: 'request-1', recommendedTotalCents: 300, storeCount: 2 },
    });
  });

  it('claims the request, so a duplicated job does no work', async () => {
    requests.claim.mockResolvedValue(false);

    await expect(useCase.execute('request-1')).resolves.toEqual({
      kind: 'already-handled',
    });
    expect(requests.complete).not.toHaveBeenCalled();
  });

  it('ignores a request that is not waiting to be computed', async () => {
    requests.findById.mockResolvedValue({ ...request, status: 'COMPLETED' });

    await expect(useCase.execute('request-1')).resolves.toEqual({
      kind: 'already-handled',
    });
    expect(requests.claim).not.toHaveBeenCalled();
  });

  it('fails the request when the list has been deleted', async () => {
    lists.findById.mockResolvedValue(null);

    const outcome = await useCase.execute('request-1');

    expect(outcome).toMatchObject({ kind: 'failed' });
    expect(requests.fail).toHaveBeenCalledWith(
      'request-1',
      'The shopping list no longer exists',
    );
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('releases the request when the attempt breaks, so a retry can take it', async () => {
    prices.findForProductsAtStores.mockRejectedValue(new Error('db down'));

    await expect(useCase.execute('request-1')).rejects.toThrow('db down');
    expect(requests.release).toHaveBeenCalledWith('request-1');
    expect(requests.fail).not.toHaveBeenCalled();
  });

  it('records a failure once the retries are spent', async () => {
    await useCase.giveUp('request-1', 'db down');

    expect(requests.fail).toHaveBeenCalledWith('request-1', 'db down');
  });

  it('ignores stores that sell nothing on the list', async () => {
    stores.findWithinBox.mockResolvedValue([
      store('a', 1),
      store('irrelevant', 1),
    ]);

    await useCase.execute('request-1');

    expect(requests.complete.mock.calls[0][1].result.consideredStoreCount).toBe(1);
  });

  it('leaves out a store beyond the radius the box over-selected', async () => {
    stores.findWithinBox.mockResolvedValue([store('a', 1), store('b', 40)]);

    await useCase.execute('request-1');

    expect(prices.findForProductsAtStores).toHaveBeenCalledWith(
      ['milk', 'bread'],
      ['a'],
    );
  });
});
