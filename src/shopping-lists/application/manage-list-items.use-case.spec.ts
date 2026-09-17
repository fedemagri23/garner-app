import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { EventBus } from '../../common/events/event-bus.js';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import {
  MAX_ITEMS_PER_LIST,
  type ShoppingList,
  type ShoppingListItem,
} from '../domain/shopping-list.entity.js';
import type { ShoppingListRepository } from '../domain/shopping-list.repository.port.js';
import type { CatalogReferences } from './catalog-references.js';
import { ManageListItemsUseCase } from './manage-list-items.use-case.js';
import { ShoppingListAccess } from './shopping-list-access.js';

const actor: AuthenticatedUser = { id: 'user-1', email: 'a@b.c', role: 'USER' };

const item = (id: string, listId = 'list-1'): ShoppingListItem => ({
  id,
  listId,
  productId: 'product-1',
  quantity: 1,
  notes: null,
  expectedUnitPriceCents: null,
  selectedStoreId: null,
  position: 1000,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const list = (items: ShoppingListItem[]): ShoppingList => ({
  id: 'list-1',
  ownerId: 'user-1',
  name: 'Weekly',
  notes: null,
  currency: 'ARS',
  sortMode: 'MANUAL',
  items,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('ManageListItemsUseCase', () => {
  let repository: {
    findById: jest.Mock;
    addItem: jest.Mock;
    removeItem: jest.Mock;
    reorderItems: jest.Mock;
  };
  let catalog: { requirePurchasableProduct: jest.Mock; requireStore: jest.Mock };
  let events: { publish: jest.Mock };
  let useCase: ManageListItemsUseCase;

  beforeEach(() => {
    repository = {
      findById: jest.fn().mockResolvedValue(list([item('a'), item('b')])),
      addItem: jest.fn().mockResolvedValue({ item: item('new'), created: true }),
      removeItem: jest.fn(),
      reorderItems: jest.fn(),
    };
    catalog = { requirePurchasableProduct: jest.fn(), requireStore: jest.fn() };
    events = { publish: jest.fn() };

    const lists = repository as unknown as ShoppingListRepository;
    useCase = new ManageListItemsUseCase(
      lists,
      new ShoppingListAccess(lists),
      catalog as unknown as CatalogReferences,
      events as unknown as EventBus,
    );
  });

  describe('add', () => {
    it('adds an item and announces it once', async () => {
      await useCase.add(actor, 'list-1', { productId: 'product-1', quantity: 2 });

      expect(repository.addItem).toHaveBeenCalled();
      expect(events.publish).toHaveBeenCalledTimes(1);
    });

    it('returns an item a retried add already created, without re-checking or re-announcing', async () => {
      const result = await useCase.add(actor, 'list-1', {
        id: 'a',
        productId: 'product-1',
        quantity: 2,
      });

      expect(result.id).toBe('a');
      expect(repository.addItem).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('lets a replay through even once the list has filled up', async () => {
      const full = Array.from({ length: MAX_ITEMS_PER_LIST }, (_, i) => item(`i${i}`));
      repository.findById.mockResolvedValue(list(full));

      await expect(
        useCase.add(actor, 'list-1', { id: 'i3', productId: 'product-1', quantity: 1 }),
      ).resolves.toMatchObject({ id: 'i3' });
    });

    it('refuses a new item on a full list', async () => {
      const full = Array.from({ length: MAX_ITEMS_PER_LIST }, (_, i) => item(`i${i}`));
      repository.findById.mockResolvedValue(list(full));

      await expect(
        useCase.add(actor, 'list-1', { productId: 'product-1', quantity: 1 }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('refuses a client id that belongs to an item on another list', async () => {
      repository.addItem.mockResolvedValue({
        item: item('elsewhere', 'other-list'),
        created: false,
      });

      await expect(
        useCase.add(actor, 'list-1', {
          id: 'elsewhere',
          productId: 'product-1',
          quantity: 1,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it.each([0, -1, 0.0001, 10000])('refuses a quantity of %p', async (quantity) => {
      await expect(
        useCase.add(actor, 'list-1', { productId: 'product-1', quantity }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reorder', () => {
    it('accepts every item exactly once', async () => {
      await useCase.reorder(actor, 'list-1', ['b', 'a']);
      expect(repository.reorderItems).toHaveBeenCalledWith('list-1', ['b', 'a']);
    });

    it.each([
      [['a']],
      [['a', 'a']],
      [['a', 'b', 'c']],
      [['a', 'x']],
    ])('refuses %p, which is not a permutation of the items', async (ids) => {
      await expect(useCase.reorder(actor, 'list-1', ids)).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.reorderItems).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('succeeds for an item that is already gone', async () => {
      await expect(useCase.remove(actor, 'list-1', 'missing')).resolves.toBeUndefined();
      expect(repository.removeItem).not.toHaveBeenCalled();
    });
  });

  it('refuses another user’s list', async () => {
    repository.findById.mockResolvedValue({ ...list([]), ownerId: 'someone-else' });

    await expect(
      useCase.add(actor, 'list-1', { productId: 'product-1', quantity: 1 }),
    ).rejects.toThrow('You do not have access to this resource');
  });
});
