import { ConflictException } from '@nestjs/common';
import type { EventBus } from '../../common/events/event-bus.js';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import type { ShoppingListAccess } from '../../shopping-lists/application/shopping-list-access.js';
import type { ShoppingList } from '../../shopping-lists/domain/shopping-list.entity.js';
import type { OptimizationRequest } from '../domain/optimization-request.entity.js';
import type {
  OptimizationJobs,
  OptimizationRequestRepository,
} from '../domain/optimization.repository.port.js';
import { OptimizationPreferencesUseCase } from './optimization-preferences.use-case.js';
import { RequestOptimizationUseCase } from './request-optimization.use-case.js';

const actor: AuthenticatedUser = { id: 'user-1', email: 'a@b.c', role: 'USER' };

const list = (items: { productId: string; quantity: number }[]): ShoppingList => ({
  id: 'list-1',
  ownerId: 'user-1',
  name: 'Weekly',
  notes: null,
  currency: 'ARS',
  sortMode: 'MANUAL',
  items: items.map((item, index) => ({
    id: `item-${index}`,
    listId: 'list-1',
    productId: item.productId,
    quantity: item.quantity,
    notes: null,
    expectedUnitPriceCents: null,
    selectedStoreId: null,
    position: index * 1000,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('RequestOptimizationUseCase', () => {
  let requests: {
    create: jest.Mock;
    findReusable: jest.Mock;
  };
  let jobs: jest.Mocked<OptimizationJobs>;
  let lists: { loadOwned: jest.Mock };
  let preferences: { get: jest.Mock };
  let events: { publish: jest.Mock };
  let useCase: RequestOptimizationUseCase;

  const command = { latitude: -34.6037, longitude: -58.3816 };

  beforeEach(() => {
    requests = {
      create: jest.fn().mockImplementation(async (input) => ({
        id: 'request-1',
        status: 'PENDING',
        result: null,
        ...input,
      })),
      findReusable: jest.fn().mockResolvedValue(null),
    };
    jobs = { enqueue: jest.fn() };
    lists = {
      loadOwned: jest
        .fn()
        .mockResolvedValue(list([{ productId: 'milk', quantity: 1 }])),
    };
    preferences = {
      get: jest.fn().mockResolvedValue({
        userId: 'user-1',
        maxStores: 2,
        maxAdditionalDistanceKm: 5,
        maxAdditionalMinutes: 20,
        minSavingsCentsPerExtraStore: 400,
        mode: 'BEST_BALANCE',
        preferredSupermarketIds: [],
        excludedSupermarketIds: [],
      }),
    };
    events = { publish: jest.fn() };

    useCase = new RequestOptimizationUseCase(
      requests as unknown as OptimizationRequestRepository,
      jobs,
      lists as unknown as ShoppingListAccess,
      preferences as unknown as OptimizationPreferencesUseCase,
      events as unknown as EventBus,
    );
  });

  it('queues the work rather than computing it in the request', async () => {
    const { request, reused } = await useCase.execute(actor, 'list-1', command);

    expect(reused).toBe(false);
    expect(request.status).toBe('PENDING');
    expect(jobs.enqueue).toHaveBeenCalledWith('request-1');
    expect(events.publish.mock.calls[0][0]).toMatchObject({
      name: 'OptimizationRequested',
    });
  });

  it('starts from the shopper’s standing preferences', async () => {
    await useCase.execute(actor, 'list-1', command);

    expect(requests.create.mock.calls[0][0].settings).toMatchObject({
      maxStores: 2,
      minSavingsCentsPerExtraStore: 400,
      mode: 'BEST_BALANCE',
    });
  });

  it('lets one request override them without changing them', async () => {
    await useCase.execute(actor, 'list-1', {
      ...command,
      maxStores: 3,
      mode: 'CHEAPEST',
    });

    expect(requests.create.mock.calls[0][0].settings).toMatchObject({
      maxStores: 3,
      mode: 'CHEAPEST',
      // Untouched by the override.
      minSavingsCentsPerExtraStore: 400,
    });
  });

  it('reuses a recent answer to the same question', async () => {
    const completed = {
      id: 'earlier',
      status: 'COMPLETED',
      completedAt: new Date(),
    } as OptimizationRequest;
    requests.findReusable.mockResolvedValue(completed);

    const { request, reused } = await useCase.execute(actor, 'list-1', command);

    expect(reused).toBe(true);
    expect(request.id).toBe('earlier');
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });

  it('computes again once the earlier answer is stale', async () => {
    requests.findReusable.mockResolvedValue({
      id: 'earlier',
      status: 'COMPLETED',
      completedAt: new Date(Date.now() - 60 * 60 * 1000),
    } as OptimizationRequest);

    const { reused } = await useCase.execute(actor, 'list-1', command);

    expect(reused).toBe(false);
    expect(jobs.enqueue).toHaveBeenCalled();
  });

  it('asks a different question when the list changes', async () => {
    await useCase.execute(actor, 'list-1', command);
    const first = requests.create.mock.calls[0][0].fingerprint;

    lists.loadOwned.mockResolvedValue(
      list([{ productId: 'milk', quantity: 2 }]),
    );
    await useCase.execute(actor, 'list-1', command);

    expect(requests.create.mock.calls[1][0].fingerprint).not.toBe(first);
  });

  it('asks a different question when a constraint changes', async () => {
    await useCase.execute(actor, 'list-1', command);
    await useCase.execute(actor, 'list-1', { ...command, maxStores: 3 });

    expect(requests.create.mock.calls[0][0].fingerprint).not.toBe(
      requests.create.mock.calls[1][0].fingerprint,
    );
  });

  it('treats a step across the room as the same question', async () => {
    await useCase.execute(actor, 'list-1', command);
    await useCase.execute(actor, 'list-1', {
      ...command,
      latitude: command.latitude + 0.00001,
    });

    expect(requests.create.mock.calls[0][0].fingerprint).toBe(
      requests.create.mock.calls[1][0].fingerprint,
    );
  });

  it('refuses to optimize an empty list', async () => {
    lists.loadOwned.mockResolvedValue(list([]));

    await expect(useCase.execute(actor, 'list-1', command)).rejects.toThrow(
      ConflictException,
    );
  });

  it('refuses another user’s list', async () => {
    lists.loadOwned.mockRejectedValue(new Error('You do not have access'));

    await expect(useCase.execute(actor, 'list-1', command)).rejects.toThrow(
      /access/,
    );
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });
});
