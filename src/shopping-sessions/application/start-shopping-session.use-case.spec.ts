import { ConflictException } from '@nestjs/common';
import type { EventBus } from '../../common/events/event-bus.js';
import type { DerivedPriceRepository } from '../../price-intelligence/domain/price-intelligence.repository.port.js';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import type { CatalogReferences } from '../../shopping-lists/application/catalog-references.js';
import type { ShoppingListAccess } from '../../shopping-lists/application/shopping-list-access.js';
import type { ShoppingList } from '../../shopping-lists/domain/shopping-list.entity.js';
import type { ShoppingSession } from '../domain/shopping-session.entity.js';
import type { ShoppingSessionRepository } from '../domain/shopping-session.repository.port.js';
import type { OptimizationRequestRepository } from '../../optimization/domain/optimization.repository.port.js';
import { StartShoppingSessionUseCase } from './start-shopping-session.use-case.js';

const actor: AuthenticatedUser = { id: 'user-1', email: 'a@b.c', role: 'USER' };

const list: ShoppingList = {
  id: 'list-1',
  ownerId: 'user-1',
  name: 'Weekly',
  notes: null,
  currency: 'ARS',
  sortMode: 'MANUAL',
  items: [
    {
      id: 'second',
      listId: 'list-1',
      productId: 'bread',
      quantity: 1,
      notes: null,
      expectedUnitPriceCents: 89,
      selectedStoreId: 'store-b',
      position: 2000,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'first',
      listId: 'list-1',
      productId: 'milk',
      quantity: 2,
      notes: 'whole',
      expectedUnitPriceCents: 125,
      selectedStoreId: null,
      position: 1000,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const started = { id: 'session-1', ownerId: 'user-1', listId: 'list-1', storeId: null } as ShoppingSession;

describe('StartShoppingSessionUseCase', () => {
  let sessions: { findById: jest.Mock; start: jest.Mock };
  let lists: { loadOwned: jest.Mock };
  let catalog: { requireStore: jest.Mock };
  let optimizations: { findById: jest.Mock };
  let events: { publish: jest.Mock };
  let prices: { findForProductsAtStores: jest.Mock };
  let useCase: StartShoppingSessionUseCase;

  beforeEach(() => {
    sessions = {
      findById: jest.fn().mockResolvedValue(null),
      start: jest.fn().mockResolvedValue({ session: started, created: true }),
    };
    lists = { loadOwned: jest.fn().mockResolvedValue(list) };
    catalog = { requireStore: jest.fn() };
    optimizations = { findById: jest.fn().mockResolvedValue(null) };
    events = { publish: jest.fn() };
    prices = { findForProductsAtStores: jest.fn().mockResolvedValue([]) };

    useCase = new StartShoppingSessionUseCase(
      sessions as unknown as ShoppingSessionRepository,
      lists as unknown as ShoppingListAccess,
      catalog as unknown as CatalogReferences,
      optimizations as unknown as OptimizationRequestRepository,
      events as unknown as EventBus,
      prices as unknown as DerivedPriceRepository,
    );
  });

  it('copies the list items in their manual order', async () => {
    await useCase.execute(actor, { listId: 'list-1' });

    const input = sessions.start.mock.calls[0][0];
    expect(input.items.map((line: { sourceListItemId: string }) => line.sourceListItemId)).toEqual([
      'first',
      'second',
    ]);
    expect(input.items[0]).toMatchObject({
      productId: 'milk',
      quantity: 2,
      expectedUnitPriceCents: 125,
      notes: 'whole',
    });
    expect(input.currency).toBe('ARS');
  });

  it('keeps each item’s pencilled-in store when no store is being shopped', async () => {
    await useCase.execute(actor, { listId: 'list-1' });

    const lines = sessions.start.mock.calls[0][0].items;
    expect(lines.map((line: { storeId: string | null }) => line.storeId)).toEqual([null, 'store-b']);
  });

  it('puts every line at the shopped store when one is given', async () => {
    await useCase.execute(actor, { listId: 'list-1', storeId: 'store-a' });

    const lines = sessions.start.mock.calls[0][0].items;
    expect(lines.every((line: { storeId: string }) => line.storeId === 'store-a')).toBe(true);
    expect(catalog.requireStore).toHaveBeenCalledWith('store-a');
  });

  it('expects what the shopped store charges, keeping the list\'s estimate where it has no price', async () => {
    prices.findForProductsAtStores.mockResolvedValue([
      { productId: 'milk', storeId: 'store-a', currency: 'ARS', priceCents: 140 },
      // In another currency: not comparable with the list's.
      { productId: 'bread', storeId: 'store-a', currency: 'EUR', priceCents: 2 },
    ]);

    await useCase.execute(actor, { listId: 'list-1', storeId: 'store-a' });

    const lines = sessions.start.mock.calls[0][0].items;
    expect(lines.map((line: { productId: string; expectedUnitPriceCents: number }) => [line.productId, line.expectedUnitPriceCents]))
      .toEqual([['milk', 140], ['bread', 89]]);
    expect(prices.findForProductsAtStores).toHaveBeenCalledWith(expect.arrayContaining(['milk', 'bread']), ['store-a']);
  });

  it('publishes ShoppingSessionStarted only when a trip was actually created', async () => {
    await useCase.execute(actor, { listId: 'list-1' });
    expect(events.publish).toHaveBeenCalledTimes(1);

    sessions.start.mockResolvedValue({ session: started, created: false });
    await useCase.execute(actor, { listId: 'list-1' });
    expect(events.publish).toHaveBeenCalledTimes(1);
  });

  it('returns the session a retried start already created', async () => {
    sessions.findById.mockResolvedValue(started);

    await expect(
      useCase.execute(actor, { id: 'session-1', listId: 'list-1' }),
    ).resolves.toBe(started);
    expect(sessions.start).not.toHaveBeenCalled();
  });

  it('still recognizes the replay after the list was deleted', async () => {
    sessions.findById.mockResolvedValue({ ...started, listId: null });

    await expect(
      useCase.execute(actor, { id: 'session-1', listId: 'list-1' }),
    ).resolves.toMatchObject({ id: 'session-1' });
  });

  it('refuses a client id that already names someone else’s trip', async () => {
    sessions.findById.mockResolvedValue({ ...started, ownerId: 'someone-else' });

    await expect(
      useCase.execute(actor, { id: 'session-1', listId: 'list-1' }),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses to start a trip from an empty list', async () => {
    lists.loadOwned.mockResolvedValue({ ...list, items: [] });

    await expect(useCase.execute(actor, { listId: 'list-1' })).rejects.toThrow(
      /empty list/,
    );
  });

  describe('from a plan', () => {
    const stop = (order: number, storeId: string, products: [string, number][]) => ({
      order,
      storeId,
      subtotalCents: 0,
      assignments: products.map(([productId, unitPriceCents]) => ({
        productId,
        quantity: 1,
        unitPriceCents,
        lineTotalCents: unitPriceCents,
      })),
    });

    const optimization = (overrides: Record<string, unknown> = {}) => ({
      id: 'opt-1',
      ownerId: 'user-1',
      listId: 'list-1',
      status: 'COMPLETED',
      settings: { mode: 'BEST_BALANCE' },
      result: {
        cheapest: { stores: [stop(1, 'store-x', [['bread', 70]]), stop(2, 'store-y', [['milk', 99]])] },
        bestBalance: { stores: [stop(1, 'store-x', [['bread', 80], ['milk', 110]])] },
        simplest: null,
      },
      ...overrides,
    });

    it('sends each line to its stop, at the plan\'s price, in route order', async () => {
      optimizations.findById.mockResolvedValue(optimization());

      await useCase.execute(actor, { listId: 'list-1', optimizationId: 'opt-1', mode: 'CHEAPEST' });

      const lines = sessions.start.mock.calls[0][0].items;
      expect(lines.map((line: { productId: string; storeId: string; expectedUnitPriceCents: number }) => [
        line.productId,
        line.storeId,
        line.expectedUnitPriceCents,
      ])).toEqual([
        ['bread', 'store-x', 70],
        ['milk', 'store-y', 99],
      ]);
    });

    it('follows the plan\'s recommendation when no alternative is named', async () => {
      optimizations.findById.mockResolvedValue(optimization());

      await useCase.execute(actor, { listId: 'list-1', optimizationId: 'opt-1' });

      const lines = sessions.start.mock.calls[0][0].items;
      expect(lines.every((line: { storeId: string }) => line.storeId === 'store-x')).toBe(true);
    });

    it('refuses someone else\'s plan, a plan for another list, or one not finished', async () => {
      optimizations.findById.mockResolvedValue(optimization({ ownerId: 'user-2' }));
      await expect(useCase.execute(actor, { listId: 'list-1', optimizationId: 'opt-1' })).rejects.toThrow('not found');

      optimizations.findById.mockResolvedValue(optimization({ listId: 'list-2' }));
      await expect(useCase.execute(actor, { listId: 'list-1', optimizationId: 'opt-1' })).rejects.toThrow(ConflictException);

      optimizations.findById.mockResolvedValue(optimization({ status: 'RUNNING', result: null }));
      await expect(useCase.execute(actor, { listId: 'list-1', optimizationId: 'opt-1' })).rejects.toThrow(ConflictException);
    });

    it('refuses an alternative with nothing to buy, and a plan together with a single store', async () => {
      optimizations.findById.mockResolvedValue(optimization());
      await expect(
        useCase.execute(actor, { listId: 'list-1', optimizationId: 'opt-1', mode: 'SIMPLEST' }),
      ).rejects.toThrow('nothing to buy');
      await expect(
        useCase.execute(actor, { listId: 'list-1', optimizationId: 'opt-1', storeId: 'store-x' }),
      ).rejects.toThrow('not both');
    });
  });
});
