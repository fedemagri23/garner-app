import { ConflictException } from '@nestjs/common';
import type { EventBus } from '../../common/events/event-bus.js';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import type { CatalogReferences } from '../../shopping-lists/application/catalog-references.js';
import type { ShoppingListAccess } from '../../shopping-lists/application/shopping-list-access.js';
import type { ShoppingList } from '../../shopping-lists/domain/shopping-list.entity.js';
import type { ShoppingSession } from '../domain/shopping-session.entity.js';
import type { ShoppingSessionRepository } from '../domain/shopping-session.repository.port.js';
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
  let events: { publish: jest.Mock };
  let useCase: StartShoppingSessionUseCase;

  beforeEach(() => {
    sessions = {
      findById: jest.fn().mockResolvedValue(null),
      start: jest.fn().mockResolvedValue({ session: started, created: true }),
    };
    lists = { loadOwned: jest.fn().mockResolvedValue(list) };
    catalog = { requireStore: jest.fn() };
    events = { publish: jest.fn() };

    useCase = new StartShoppingSessionUseCase(
      sessions as unknown as ShoppingSessionRepository,
      lists as unknown as ShoppingListAccess,
      catalog as unknown as CatalogReferences,
      events as unknown as EventBus,
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
});
