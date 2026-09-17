import { ConflictException } from '@nestjs/common';
import type { EventBus } from '../../common/events/event-bus.js';
import type { AuthenticatedUser } from '../../security/domain/authenticated-user.js';
import type {
  ShoppingSession,
  ShoppingSessionItem,
  ShoppingSessionStatus,
} from '../domain/shopping-session.entity.js';
import type { ShoppingSessionRepository } from '../domain/shopping-session.repository.port.js';
import { ChangeSessionStatusUseCase } from './change-session-status.use-case.js';
import type { ShoppingSessionAccess } from './shopping-session-access.js';

const actor: AuthenticatedUser = { id: 'user-1', email: 'a@b.c', role: 'USER' };

const item = (overrides: Partial<ShoppingSessionItem>): ShoppingSessionItem => ({
  id: 'item-1',
  sessionId: 'session-1',
  sourceListItemId: null,
  productId: 'product-1',
  quantity: 1,
  notes: null,
  expectedUnitPriceCents: 125,
  actualUnitPriceCents: null,
  storeId: 'store-1',
  isPurchased: false,
  purchasedAt: null,
  position: 1000,
  ...overrides,
});

const session = (
  status: ShoppingSessionStatus,
  items: ShoppingSessionItem[] = [],
): ShoppingSession => ({
  id: 'session-1',
  ownerId: 'user-1',
  listId: 'list-1',
  listName: 'Weekly',
  currency: 'ARS',
  storeId: 'store-1',
  status,
  startedAt: new Date('2026-09-17T10:00:00Z'),
  pausedAt: null,
  completedAt: null,
  abandonedAt: null,
  items,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('ChangeSessionStatusUseCase', () => {
  let sessions: jest.Mocked<Pick<ShoppingSessionRepository, 'changeStatus'>>;
  let access: { loadOwned: jest.Mock };
  let events: { publish: jest.Mock };
  let useCase: ChangeSessionStatusUseCase;

  beforeEach(() => {
    sessions = { changeStatus: jest.fn() };
    access = { loadOwned: jest.fn() };
    events = { publish: jest.fn() };

    useCase = new ChangeSessionStatusUseCase(
      sessions as unknown as ShoppingSessionRepository,
      access as unknown as ShoppingSessionAccess,
      events as unknown as EventBus,
    );
  });

  it('completes an active trip and publishes what was bought', async () => {
    const bought = item({
      id: 'bought',
      isPurchased: true,
      actualUnitPriceCents: 132,
      purchasedAt: new Date('2026-09-17T10:05:00Z'),
    });
    const skipped = item({ id: 'skipped' });

    access.loadOwned.mockResolvedValue(session('ACTIVE', [bought, skipped]));
    sessions.changeStatus.mockResolvedValue(
      session('COMPLETED', [bought, skipped]),
    );

    await useCase.execute(actor, 'session-1', 'complete');

    expect(sessions.changeStatus).toHaveBeenCalledWith(
      'session-1',
      'ACTIVE',
      expect.objectContaining({ status: 'COMPLETED' }),
    );
    expect(events.publish).toHaveBeenCalledTimes(1);
    expect(events.publish.mock.calls[0][0]).toMatchObject({
      name: 'ShoppingSessionCompleted',
      payload: {
        sessionId: 'session-1',
        currency: 'ARS',
        purchases: [
          {
            productId: 'product-1',
            actualUnitPriceCents: 132,
            expectedUnitPriceCents: 125,
            purchasedAt: '2026-09-17T10:05:00.000Z',
          },
        ],
      },
    });
  });

  it('builds the event from the session read inside the completing write', async () => {
    // A purchase that landed between the first read and the locked write
    // must still be in the event.
    access.loadOwned.mockResolvedValue(session('ACTIVE', [item({})]));
    sessions.changeStatus.mockResolvedValue(
      session('COMPLETED', [item({ isPurchased: true, purchasedAt: new Date() })]),
    );

    await useCase.execute(actor, 'session-1', 'complete');

    expect(events.publish.mock.calls[0][0].payload.purchases).toHaveLength(1);
  });

  it('treats completing a completed trip as a replay: no write, no second event', async () => {
    access.loadOwned.mockResolvedValue(session('COMPLETED'));

    await useCase.execute(actor, 'session-1', 'complete');

    expect(sessions.changeStatus).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('re-decides after losing a race, and does not publish when the winner completed it', async () => {
    access.loadOwned
      .mockResolvedValueOnce(session('ACTIVE'))
      .mockResolvedValueOnce(session('COMPLETED'));
    sessions.changeStatus.mockResolvedValue(null);

    await useCase.execute(actor, 'session-1', 'complete');

    expect(sessions.changeStatus).toHaveBeenCalledTimes(1);
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('rejects completing an abandoned trip', async () => {
    access.loadOwned.mockResolvedValue(session('ABANDONED'));

    await expect(
      useCase.execute(actor, 'session-1', 'complete'),
    ).rejects.toThrow(ConflictException);
  });

  it('does not publish anything for pause, resume or abandon', async () => {
    access.loadOwned.mockResolvedValue(session('ACTIVE'));
    sessions.changeStatus.mockResolvedValue(session('PAUSED'));

    await useCase.execute(actor, 'session-1', 'pause');

    expect(sessions.changeStatus).toHaveBeenCalledWith(
      'session-1',
      'ACTIVE',
      expect.objectContaining({ status: 'PAUSED', pausedAt: expect.any(Date) }),
    );
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('gives up with a conflict rather than looping forever', async () => {
    access.loadOwned.mockResolvedValue(session('ACTIVE'));
    sessions.changeStatus.mockResolvedValue(null);

    await expect(
      useCase.execute(actor, 'session-1', 'complete'),
    ).rejects.toThrow(ConflictException);
    expect(sessions.changeStatus).toHaveBeenCalledTimes(3);
  });
});
