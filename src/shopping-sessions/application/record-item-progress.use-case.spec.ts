import { ConflictException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import type {
  ShoppingSession,
  ShoppingSessionItem,
  ShoppingSessionStatus,
} from '../domain/shopping-session.entity.js';
import type { ShoppingSessionRepository } from '../domain/shopping-session.repository.port.js';
import { RecordItemProgressUseCase } from './record-item-progress.use-case.js';
import { ShoppingSessionAccess } from './shopping-session-access.js';

const actor: AuthenticatedUser = { id: 'user-1', email: 'a@b.c', role: 'USER' };

const baseItem: ShoppingSessionItem = {
  id: 'item-1',
  sessionId: 'session-1',
  sourceListItemId: null,
  productId: 'product-1',
  quantity: 1,
  notes: null,
  expectedUnitPriceCents: 125,
  actualUnitPriceCents: null,
  storeId: null,
  isPurchased: false,
  purchasedAt: null,
  position: 1000,
};

const session = (
  status: ShoppingSessionStatus,
  item: Partial<ShoppingSessionItem> = {},
): ShoppingSession => ({
  id: 'session-1',
  ownerId: 'user-1',
  listId: 'list-1',
  listName: 'Weekly',
  currency: 'ARS',
  storeId: null,
  status,
  startedAt: new Date(Date.now() - 60 * 60 * 1000),
  pausedAt: null,
  completedAt: null,
  abandonedAt: null,
  items: [{ ...baseItem, ...item }],
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('RecordItemProgressUseCase', () => {
  let repository: { findById: jest.Mock; updateItemWhileOpen: jest.Mock };
  let useCase: RecordItemProgressUseCase;

  beforeEach(() => {
    repository = {
      findById: jest.fn(),
      updateItemWhileOpen: jest.fn().mockResolvedValue(true),
    };

    const sessions = repository as unknown as ShoppingSessionRepository;
    useCase = new RecordItemProgressUseCase(
      sessions,
      new ShoppingSessionAccess(sessions),
    );
  });

  it('records an actual price and purchase on an open trip', async () => {
    repository.findById.mockResolvedValue(session('ACTIVE'));
    const reported = new Date(Date.now() - 10 * 60 * 1000);

    await useCase.execute(actor, 'session-1', 'item-1', {
      actualUnitPriceCents: 132,
      isPurchased: true,
      purchasedAt: reported,
    });

    expect(repository.updateItemWhileOpen).toHaveBeenCalledWith(
      'session-1',
      'item-1',
      { actualUnitPriceCents: 132, isPurchased: true, purchasedAt: reported, quantity: undefined },
    );
  });

  it('still accepts changes while paused, since offline edits sync late', async () => {
    repository.findById.mockResolvedValue(session('PAUSED'));

    await useCase.execute(actor, 'session-1', 'item-1', { isPurchased: true });

    expect(repository.updateItemWhileOpen).toHaveBeenCalled();
  });

  it('keeps the original purchase time when "purchased" is replayed without one', async () => {
    const original = new Date(Date.now() - 20 * 60 * 1000);
    repository.findById.mockResolvedValue(
      session('ACTIVE', { isPurchased: true, purchasedAt: original }),
    );

    await useCase.execute(actor, 'session-1', 'item-1', { isPurchased: true });

    expect(repository.updateItemWhileOpen.mock.calls[0][2].purchasedAt).toBe(
      original,
    );
  });

  it('clears the purchase time when an item is un-ticked', async () => {
    repository.findById.mockResolvedValue(
      session('ACTIVE', { isPurchased: true, purchasedAt: new Date() }),
    );

    await useCase.execute(actor, 'session-1', 'item-1', { isPurchased: false });

    expect(repository.updateItemWhileOpen.mock.calls[0][2]).toMatchObject({
      isPurchased: false,
      purchasedAt: null,
    });
  });

  it('accepts a replay of what a completed trip already holds', async () => {
    repository.findById.mockResolvedValue(
      session('COMPLETED', { isPurchased: true, actualUnitPriceCents: 132 }),
    );

    await expect(
      useCase.execute(actor, 'session-1', 'item-1', {
        isPurchased: true,
        actualUnitPriceCents: 132,
      }),
    ).resolves.toBeUndefined();
    expect(repository.updateItemWhileOpen).not.toHaveBeenCalled();
  });

  it('refuses to rewrite a completed trip', async () => {
    repository.findById.mockResolvedValue(
      session('COMPLETED', { isPurchased: true, actualUnitPriceCents: 132 }),
    );

    await expect(
      useCase.execute(actor, 'session-1', 'item-1', { actualUnitPriceCents: 150 }),
    ).rejects.toThrow(ConflictException);
  });

  it('re-reads and refuses when the trip closed between read and write', async () => {
    repository.findById
      .mockResolvedValueOnce(session('ACTIVE'))
      .mockResolvedValueOnce(session('COMPLETED'));
    repository.updateItemWhileOpen.mockResolvedValue(false);

    await expect(
      useCase.execute(actor, 'session-1', 'item-1', { actualUnitPriceCents: 150 }),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses another user’s trip', async () => {
    repository.findById.mockResolvedValue({
      ...session('ACTIVE'),
      ownerId: 'someone-else',
    });

    await expect(
      useCase.execute(actor, 'session-1', 'item-1', { isPurchased: true }),
    ).rejects.toThrow('You do not have access to this resource');
    expect(repository.updateItemWhileOpen).not.toHaveBeenCalled();
  });
});
