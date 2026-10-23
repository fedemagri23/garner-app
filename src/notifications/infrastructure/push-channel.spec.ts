import type { SubjectNamesLoader } from '../application/notification-names.js';
import type {
  DeviceTokenRepository,
  NotificationRecipient,
  PushSender,
} from '../domain/notification.repository.port.js';
import type { Notification } from '../domain/price-alert.entity.js';
import { PushChannel } from './push-channel.js';

const notification = {
  id: 'n1',
  userId: 'user-1',
  category: 'PRICE_ALERT',
  title: 'English',
  body: 'English',
  productId: 'milk',
  storeId: 'store-1',
  reason: 'BELOW_THRESHOLD',
  priceCents: 139000,
  previousPriceCents: 150000,
  currency: 'ARS',
} as unknown as Notification;

const recipient = (deviceTokens: string[], language = 'es') =>
  ({ userId: 'user-1', email: null, preferences: {}, deviceTokens, language }) as unknown as NotificationRecipient;

describe('PushChannel', () => {
  let sender: { send: jest.Mock };
  let devices: { removeMany: jest.Mock };
  let channel: PushChannel;

  beforeEach(() => {
    sender = { send: jest.fn().mockResolvedValue([{ token: 't1', status: 'ok' }]) };
    devices = { removeMany: jest.fn() };
    const names = {
      forSubjects: jest.fn().mockResolvedValue(() => ({
        productName: 'Leche entera 1 L',
        storeName: 'Día Almagro',
        supermarketName: 'Día',
      })),
    };
    channel = new PushChannel(
      sender as unknown as PushSender,
      devices as unknown as DeviceTokenRepository,
      names as unknown as SubjectNamesLoader,
    );
  });

  it('applies only to a shopper with a registered phone', () => {
    expect(channel.appliesTo(recipient([]))).toBe(false);
    expect(channel.appliesTo(recipient(['t1']))).toBe(true);
  });

  it('sends Spanish text to every phone, with what the app needs to open the product', async () => {
    await channel.send(notification, recipient(['t1', 't2']));

    expect(sender.send).toHaveBeenCalledWith([
      {
        to: 't1',
        title: 'Leche entera 1 L bajó a $ 1.390',
        body: 'En Día Almagro, por debajo del precio que pediste.',
        data: { notificationId: 'n1', productId: 'milk' },
      },
      expect.objectContaining({ to: 't2' }),
    ]);
  });

  it('writes in the language the shopper uses the app in', async () => {
    await channel.send(notification, recipient(['t1'], 'en'));

    expect(sender.send).toHaveBeenCalledWith([
      expect.objectContaining({
        title: 'Leche entera 1 L dropped to AR$1,390',
        body: 'At Día Almagro, below the price you asked for.',
      }),
    ]);
  });

  it('forgets a phone the service says is gone, and does not call that a failure', async () => {
    sender.send.mockResolvedValue([{ token: 't1', status: 'invalid' }]);

    await expect(channel.send(notification, recipient(['t1']))).resolves.toBeUndefined();

    expect(devices.removeMany).toHaveBeenCalledWith(['t1']);
  });

  it('succeeds when at least one phone took it', async () => {
    sender.send.mockResolvedValue([
      { token: 't1', status: 'error', message: 'busy' },
      { token: 't2', status: 'ok' },
    ]);

    await expect(channel.send(notification, recipient(['t1', 't2']))).resolves.toBeUndefined();
  });

  it('fails, to be retried, when every phone was refused for a reason that may pass', async () => {
    sender.send.mockResolvedValue([{ token: 't1', status: 'error', message: 'busy' }]);

    await expect(channel.send(notification, recipient(['t1']))).rejects.toThrow('busy');
  });

  it('lets a service outage fail the send, so the delivery retries', async () => {
    sender.send.mockRejectedValue(new Error('The push service answered 503'));

    await expect(channel.send(notification, recipient(['t1']))).rejects.toThrow('503');
  });
});
