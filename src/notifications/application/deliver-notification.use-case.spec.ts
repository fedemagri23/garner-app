import type { UserRepository } from '../../users/domain/user.repository.port.js';
import type {
  ChannelDelivery,
  ChannelDeliveryLedger,
  NotificationChannel,
  NotificationPreferencesRepository,
  NotificationRepository,
} from '../domain/notification.repository.port.js';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type Notification,
} from '../domain/price-alert.entity.js';
import {
  DeliverNotificationUseCase,
  MAX_CHANNEL_ATTEMPTS,
} from './deliver-notification.use-case.js';

const now = new Date('2026-10-19T12:00:00Z');

const message = (overrides: Partial<Notification> = {}): Notification => ({
  id: 'n-1',
  userId: 'user-1',
  category: 'PRICE_ALERT',
  title: 'Leche dropped',
  body: 'Now 4.30 at Carrefour',
  productId: null,
  storeId: null,
  listId: null,
  alertId: null,
  status: 'PENDING',
  dedupeKey: 'k',
  createdAt: now,
  deliverAt: now,
  sentAt: null,
  readAt: null,
  error: null,
  ...overrides,
});

const channel = (name: string, applies = true) => ({
  name,
  appliesTo: jest.fn().mockReturnValue(applies),
  send: jest.fn().mockResolvedValue(undefined),
});

describe('DeliverNotificationUseCase', () => {
  let notifications: {
    findById: jest.Mock;
    findDueForDelivery: jest.Mock;
    markSent: jest.Mock;
    markFailed: jest.Mock;
  };
  let preferences: { find: jest.Mock };
  let ledger: jest.Mocked<ChannelDeliveryLedger>;
  let users: { findById: jest.Mock };
  let inApp: ReturnType<typeof channel>;
  let email: ReturnType<typeof channel>;

  const useCase = () =>
    new DeliverNotificationUseCase(
      notifications as unknown as NotificationRepository,
      preferences as unknown as NotificationPreferencesRepository,
      ledger,
      [inApp, email] as NotificationChannel[],
      users as unknown as UserRepository,
    );

  const history = (deliveries: Partial<ChannelDelivery>[]) =>
    ledger.findForNotification.mockResolvedValue(
      deliveries.map((delivery) => ({
        channel: 'email',
        sentAt: null,
        attempts: 0,
        abandonedAt: null,
        lastError: null,
        ...delivery,
      })),
    );

  beforeEach(() => {
    notifications = {
      findById: jest.fn().mockResolvedValue(message()),
      findDueForDelivery: jest.fn().mockResolvedValue([]),
      markSent: jest.fn(),
      markFailed: jest.fn(),
    };
    preferences = {
      find: jest
        .fn()
        .mockResolvedValue({ userId: 'user-1', ...DEFAULT_NOTIFICATION_PREFERENCES, emailEnabled: true }),
    };
    ledger = {
      findForNotification: jest.fn().mockResolvedValue([]),
      recordSent: jest.fn().mockResolvedValue(true),
      recordFailure: jest.fn().mockResolvedValue(true),
    };
    users = { findById: jest.fn().mockResolvedValue({ id: 'user-1', email: 'ana@example.com' }) };
    inApp = channel('in-app');
    email = channel('email');
  });

  it('sends on every channel that applies and records each one', async () => {
    expect(await useCase().execute('n-1', now)).toBe(true);

    expect(inApp.send).toHaveBeenCalled();
    expect(email.send).toHaveBeenCalledWith(
      message(),
      expect.objectContaining({ email: 'ana@example.com' }),
    );
    expect(ledger.recordSent.mock.calls.map(([, name]) => name)).toEqual(['in-app', 'email']);
    expect(notifications.markSent).toHaveBeenCalledWith('n-1', now, null);
  });

  it('skips a channel that does not apply, such as email without consent', async () => {
    email = channel('email', false);

    await useCase().execute('n-1', now);

    expect(email.send).not.toHaveBeenCalled();
    expect(notifications.markSent).toHaveBeenCalled();
  });

  it('on a retry, sends only where the message has not gone yet', async () => {
    history([{ channel: 'in-app', sentAt: now }, { channel: 'email', attempts: 1 }]);

    await useCase().execute('n-1', now);

    expect(inApp.send).not.toHaveBeenCalled();
    expect(email.send).toHaveBeenCalled();
  });

  it('records a failed channel, keeps the others, and throws so the job retries', async () => {
    email.send.mockRejectedValue(new Error('SMTP 451'));

    await expect(useCase().execute('n-1', now)).rejects.toThrow('SMTP 451');

    expect(ledger.recordSent).toHaveBeenCalledWith('n-1', 'in-app', now);
    expect(ledger.recordFailure).toHaveBeenCalledWith('n-1', 'email', 'SMTP 451', null);
    expect(notifications.markFailed).toHaveBeenCalledWith('n-1', 'email: SMTP 451');
    expect(notifications.markSent).not.toHaveBeenCalled();
  });

  it('gives up on a channel after its last attempt, and finishes the message', async () => {
    history([{ channel: 'email', attempts: MAX_CHANNEL_ATTEMPTS - 1 }]);
    email.send.mockRejectedValue(new Error('mailbox does not exist'));

    expect(await useCase().execute('n-1', now)).toBe(true);

    expect(ledger.recordFailure).toHaveBeenCalledWith('n-1', 'email', 'mailbox does not exist', now);
    expect(notifications.markSent).toHaveBeenCalledWith(
      'n-1',
      now,
      'Gave up on email: mailbox does not exist',
    );
  });

  it('never retries a channel it has given up on', async () => {
    history([{ channel: 'email', attempts: 5, abandonedAt: now, lastError: 'bounced' }]);

    await useCase().execute('n-1', now);

    expect(email.send).not.toHaveBeenCalled();
    expect(notifications.markSent).toHaveBeenCalledWith('n-1', now, 'Gave up on email: bounced');
  });

  it('does not email an account that no longer exists', async () => {
    users.findById.mockResolvedValue(null);

    await useCase().execute('n-1', now);

    expect(email.appliesTo).toHaveBeenCalledWith(expect.objectContaining({ email: null }));
  });

  it('stops quietly when the message is deleted while it is going out', async () => {
    ledger.recordSent.mockResolvedValue(false);

    expect(await useCase().execute('n-1', now)).toBe(false);

    expect(email.send).not.toHaveBeenCalled();
    expect(notifications.markSent).not.toHaveBeenCalled();
    expect(notifications.markFailed).not.toHaveBeenCalled();
  });

  it('leaves a message alone until its quiet period is over', async () => {
    notifications.findById.mockResolvedValue(message({ deliverAt: new Date(now.getTime() + 60_000) }));

    expect(await useCase().execute('n-1', now)).toBe(false);
    expect(inApp.send).not.toHaveBeenCalled();
  });

  it('keeps sweeping past a message that fails again', async () => {
    notifications.findDueForDelivery.mockResolvedValue([
      message({ id: 'n-1' }),
      message({ id: 'n-2' }),
    ]);
    email.send.mockRejectedValueOnce(new Error('timeout'));

    expect(await useCase().deliverDue(now)).toBe(1);
    expect(inApp.send).toHaveBeenCalledTimes(2);
  });
});
