import type { EventBus } from '../../common/events/event-bus.js';
import type { DerivedPriceRepository } from '../../price-intelligence/domain/price-intelligence.repository.port.js';
import type { ProductRepository } from '../../products/domain/product.repository.port.js';
import type { StoreLocationRepository } from '../../supermarkets/domain/supermarket.repository.port.js';
import type { Notification, PriceAlert } from '../domain/price-alert.entity.js';
import type {
  NotificationJobs,
  NotificationRepository,
  PriceAlertRepository,
} from '../domain/notification.repository.port.js';
import { EvaluatePriceAlertsUseCase } from './evaluate-price-alerts.use-case.js';
import type { NotificationPreferencesUseCase } from './notification-preferences.use-case.js';

const now = new Date('2026-09-24T12:00:00Z');

const alert = (overrides: Partial<PriceAlert> = {}): PriceAlert => ({
  id: 'alert-1',
  ownerId: 'user-1',
  productId: 'milk',
  type: 'BELOW_THRESHOLD',
  storeId: null,
  thresholdCents: 100,
  dropPercent: null,
  latitude: null,
  longitude: null,
  radiusKm: null,
  isEnabled: true,
  lastTriggeredAt: null,
  lastNotifiedPriceCents: null,
  createdAt: new Date(),
  ...overrides,
});

const change = {
  productId: 'milk',
  storeId: 'store-1',
  priceCents: 90,
  previousPriceCents: 120,
};

describe('EvaluatePriceAlertsUseCase', () => {
  let alerts: {
    findEnabledForProduct: jest.Mock;
    markTriggered: jest.Mock;
  };
  let notifications: { create: jest.Mock };
  let jobs: jest.Mocked<NotificationJobs>;
  let prices: { findForProduct: jest.Mock };
  let stores: { findById: jest.Mock };
  let products: { findById: jest.Mock };
  let preferences: { get: jest.Mock };
  let events: { publish: jest.Mock };
  let useCase: EvaluatePriceAlertsUseCase;

  beforeEach(() => {
    alerts = {
      findEnabledForProduct: jest.fn().mockResolvedValue([alert()]),
      markTriggered: jest.fn(),
    };
    notifications = {
      create: jest
        .fn()
        .mockImplementation(async (input) => ({
          id: 'notification-1',
          ...input,
        }) as Notification),
    };
    jobs = { enqueueEvaluation: jest.fn(), enqueueDelivery: jest.fn() };
    prices = { findForProduct: jest.fn().mockResolvedValue([]) };
    stores = {
      findById: jest.fn().mockResolvedValue({
        id: 'store-1',
        name: 'Centro',
        latitude: -34.6,
        longitude: -58.38,
        supermarket: { name: 'Coto' },
      }),
    };
    products = {
      findById: jest.fn().mockResolvedValue({ id: 'milk', name: 'Leche Entera 1L' }),
    };
    preferences = {
      get: jest.fn().mockResolvedValue({
        userId: 'user-1',
        priceAlertsEnabled: true,
        remindersEnabled: true,
        quietHoursStartUtc: null,
        quietHoursEndUtc: null,
        minMinutesBetweenAlerts: 360,
      }),
    };
    events = { publish: jest.fn() };

    useCase = new EvaluatePriceAlertsUseCase(
      alerts as unknown as PriceAlertRepository,
      notifications as unknown as NotificationRepository,
      jobs,
      prices as unknown as DerivedPriceRepository,
      stores as unknown as StoreLocationRepository,
      products as unknown as ProductRepository,
      preferences as unknown as NotificationPreferencesUseCase,
      events as unknown as EventBus,
    );
  });

  it('raises a message, announces it and queues its delivery', async () => {
    await expect(useCase.execute(change, now)).resolves.toEqual({
      examined: 1,
      raised: 1,
    });

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        category: 'PRICE_ALERT',
        productId: 'milk',
        storeId: 'store-1',
        alertId: 'alert-1',
        dedupeKey: 'alert:alert-1:store-1:90',
      }),
    );
    expect(events.publish.mock.calls[0][0]).toMatchObject({
      name: 'PriceAlertTriggered',
      payload: { reason: 'BELOW_THRESHOLD', notificationId: 'notification-1' },
    });
    expect(jobs.enqueueDelivery).toHaveBeenCalledWith('notification-1', now);
  });

  it('names the product and the shop in the message', async () => {
    await useCase.execute(change, now);

    const { title, body } = notifications.create.mock.calls[0][0];
    expect(title).toContain('Leche Entera 1L');
    expect(body).toContain('Coto Centro');
    expect(body).toContain('0.90');
  });

  it('records that the alert spoke, so it will not repeat itself', async () => {
    await useCase.execute(change, now);

    expect(alerts.markTriggered).toHaveBeenCalledWith('alert-1', now, 90);
  });

  it('says nothing when the shopper has price alerts turned off', async () => {
    preferences.get.mockResolvedValue({
      priceAlertsEnabled: false,
      minMinutesBetweenAlerts: 360,
      quietHoursStartUtc: null,
      quietHoursEndUtc: null,
    });

    await expect(useCase.execute(change, now)).resolves.toMatchObject({ raised: 0 });
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('holds off when the alert spoke recently', async () => {
    alerts.findEnabledForProduct.mockResolvedValue([
      alert({ lastTriggeredAt: new Date('2026-09-24T11:00:00Z') }),
    ]);

    await expect(useCase.execute(change, now)).resolves.toMatchObject({ raised: 0 });
  });

  it('holds a message raised during quiet hours until they end', async () => {
    preferences.get.mockResolvedValue({
      priceAlertsEnabled: true,
      minMinutesBetweenAlerts: 360,
      quietHoursStartUtc: 11,
      quietHoursEndUtc: 15,
    });

    await useCase.execute(change, now);

    const { deliverAt } = notifications.create.mock.calls[0][0];
    expect(deliverAt.toISOString()).toBe('2026-09-24T15:00:00.000Z');
    expect(jobs.enqueueDelivery).toHaveBeenCalledWith('notification-1', deliverAt);
  });

  it('raises nothing twice when another worker got there first', async () => {
    notifications.create.mockResolvedValue(null);

    await expect(useCase.execute(change, now)).resolves.toMatchObject({ raised: 0 });
    expect(alerts.markTriggered).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('does nothing when nobody is watching the product', async () => {
    alerts.findEnabledForProduct.mockResolvedValue([]);

    await expect(useCase.execute(change, now)).resolves.toEqual({
      examined: 0,
      raised: 0,
    });
    expect(stores.findById).not.toHaveBeenCalled();
  });

  it('judges "cheapest nearby" against the other stores it knows', async () => {
    alerts.findEnabledForProduct.mockResolvedValue([
      alert({
        type: 'CHEAPER_NEARBY',
        thresholdCents: null,
        latitude: -34.6,
        longitude: -58.38,
        radiusKm: 5,
      }),
    ]);
    prices.findForProduct.mockResolvedValue([
      { storeId: 'store-1', priceCents: 90 },
      { storeId: 'store-2', priceCents: 150 },
    ]);

    await expect(useCase.execute(change, now)).resolves.toMatchObject({ raised: 1 });
    expect(events.publish.mock.calls[0][0].payload.reason).toBe('CHEAPER_NEARBY');
  });

  it('stays quiet when another shop nearby is still cheaper', async () => {
    alerts.findEnabledForProduct.mockResolvedValue([
      alert({
        type: 'CHEAPER_NEARBY',
        thresholdCents: null,
        latitude: -34.6,
        longitude: -58.38,
        radiusKm: 5,
      }),
    ]);
    prices.findForProduct.mockResolvedValue([
      { storeId: 'store-2', priceCents: 50 },
    ]);

    await expect(useCase.execute(change, now)).resolves.toMatchObject({ raised: 0 });
  });
});
