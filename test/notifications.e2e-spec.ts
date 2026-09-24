import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { CorePrismaService } from '../src/common/database/core-prisma.service.js';
import { EvaluatePriceAlertsUseCase } from '../src/notifications/application/evaluate-price-alerts.use-case.js';
import { DeliverNotificationUseCase } from '../src/notifications/application/deliver-notification.use-case.js';
import {
  createTestApp,
  registerWithRole,
  resetDatabase,
  uniqueEmail,
} from './helpers/test-app.js';

describe('Price alerts and notifications (e2e)', () => {
  let app: INestApplication<App>;
  let core: CorePrismaService;
  let evaluate: EvaluatePriceAlertsUseCase;
  let deliver: DeliverNotificationUseCase;

  let shopper: string;
  let intruder: string;
  let milkId: string;
  let storeId: string;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  /** A price change, as the worker would receive it from DerivedPriceUpdated. */
  const priceChanges = (priceCents: number, previousPriceCents: number | null) =>
    evaluate.execute({ productId: milkId, storeId, priceCents, previousPriceCents });

  const inbox = async (token: string) =>
    (await http().get('/v1/notifications').set(auth(token)).expect(200)).body;

  beforeAll(async () => {
    app = (await createTestApp()) as INestApplication<App>;
    await resetDatabase(app);

    core = app.get(CorePrismaService);
    evaluate = app.get(EvaluatePriceAlertsUseCase);
    deliver = app.get(DeliverNotificationUseCase);

    const register = async (prefix: string) =>
      (
        await http()
          .post('/v1/auth/register')
          .send({
            email: uniqueEmail(prefix),
            password: 'correct-horse-battery',
            displayName: 'Shopper',
          })
          .expect(201)
      ).body.accessToken as string;

    shopper = await register('alerts');
    intruder = await register('alerts-other');
    const curator = (await registerWithRole(app, 'ADMIN')).accessToken;

    const categoryId = (
      await http()
        .post('/v1/categories')
        .set(auth(curator))
        .send({ name: 'Lácteos' })
        .expect(201)
    ).body.id;

    milkId = (
      await http()
        .post('/v1/products')
        .set(auth(curator))
        .send({ name: 'Leche Entera 1L', categoryId, unit: 'LITER', packageSize: 1 })
        .expect(201)
    ).body.id;

    const chain = await http()
      .post('/v1/supermarkets')
      .set(auth(curator))
      .send({ name: 'Coto' })
      .expect(201);

    storeId = (
      await http()
        .post('/v1/stores')
        .set(auth(curator))
        .send({
          supermarketId: chain.body.id,
          name: 'Coto Centro',
          addressLine: 'Av. Corrientes 1000',
          city: 'Buenos Aires',
          country: 'AR',
          latitude: -34.6047,
          longitude: -58.3826,
        })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await resetDatabase(app);
    await app.close();
  });

  beforeEach(async () => {
    await core.notification.deleteMany();
    await core.priceAlert.deleteMany();
    await core.notificationPreferences.deleteMany();
  });

  const createAlert = async (
    body: Record<string, unknown>,
    token = shopper,
  ): Promise<string> =>
    (
      await http()
        .post('/v1/price-alerts')
        .set(auth(token))
        .send({ productId: milkId, ...body })
        .expect(201)
    ).body.id;

  describe('setting an alert', () => {
    it('watches a product for a price below a figure', async () => {
      const id = await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });

      const alerts = await http()
        .get('/v1/price-alerts')
        .set(auth(shopper))
        .expect(200);

      expect(alerts.body.data).toEqual([
        expect.objectContaining({
          id,
          type: 'BELOW_THRESHOLD',
          thresholdCents: 100,
          isEnabled: true,
          lastTriggeredAt: null,
        }),
      ]);
    });

    it('refuses an alert missing the figures it needs', async () => {
      await http()
        .post('/v1/price-alerts')
        .set(auth(shopper))
        .send({ productId: milkId, type: 'BELOW_THRESHOLD' })
        .expect(400);

      await http()
        .post('/v1/price-alerts')
        .set(auth(shopper))
        .send({ productId: milkId, type: 'CHEAPER_NEARBY', radiusKm: 5 })
        .expect(400);
    });

    it('refuses an alert on a product that does not exist', async () => {
      await http()
        .post('/v1/price-alerts')
        .set(auth(shopper))
        .send({ productId: randomUUID(), type: 'PRICE_DROP', dropPercent: 10 })
        .expect(404);
    });
  });

  describe('when a price changes', () => {
    it('tells the shopper, once', async () => {
      await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });

      await priceChanges(90, 120);
      await priceChanges(90, 120);

      const { data, unreadCount } = await inbox(shopper);

      expect(data).toHaveLength(1);
      expect(unreadCount).toBe(1);
      expect(data[0]).toMatchObject({
        category: 'PRICE_ALERT',
        productId: milkId,
        storeId,
      });
      expect(data[0].title).toContain('Leche Entera 1L');
    });

    it('says nothing while the price stays above the figure', async () => {
      await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });

      await priceChanges(150, 160);

      expect((await inbox(shopper)).data).toHaveLength(0);
    });

    it('speaks again only for a new low', async () => {
      await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });
      await http()
        .patch('/v1/notification-preferences')
        .set(auth(shopper))
        .send({ minMinutesBetweenAlerts: 0 })
        .expect(200);

      await priceChanges(90, 120);
      await priceChanges(95, 90);
      await priceChanges(80, 95);

      const { data } = await inbox(shopper);
      expect(data).toHaveLength(2);
    });

    it('holds off when an alert has just spoken', async () => {
      await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });

      await priceChanges(90, 120);
      await priceChanges(70, 90);

      expect((await inbox(shopper)).data).toHaveLength(1);
    });

    it('reports a meaningful drop whatever the price started at', async () => {
      await createAlert({ type: 'PRICE_DROP', dropPercent: 20 });

      await priceChanges(700, 1000);

      const { data } = await inbox(shopper);
      expect(data).toHaveLength(1);
      expect(data[0].body).toContain('7.00');
    });

    it('only tells the shopper who set the alert', async () => {
      await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });

      await priceChanges(90, 120);

      expect((await inbox(intruder)).data).toHaveLength(0);
    });

    it('respects a paused alert', async () => {
      const id = await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });

      await http()
        .patch(`/v1/price-alerts/${id}`)
        .set(auth(shopper))
        .send({ isEnabled: false })
        .expect(200);

      await priceChanges(90, 120);

      expect((await inbox(shopper)).data).toHaveLength(0);
    });

    it('stops watching once the alert is deleted', async () => {
      const id = await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });

      await http().delete(`/v1/price-alerts/${id}`).set(auth(shopper)).expect(204);
      await http().delete(`/v1/price-alerts/${id}`).set(auth(shopper)).expect(204);

      await priceChanges(90, 120);

      expect((await inbox(shopper)).data).toHaveLength(0);
    });
  });

  describe('preferences', () => {
    it('reads as defaults before anything is chosen', async () => {
      const response = await http()
        .get('/v1/notification-preferences')
        .set(auth(shopper))
        .expect(200);

      expect(response.body).toMatchObject({
        priceAlertsEnabled: true,
        quietHoursStartUtc: null,
        minMinutesBetweenAlerts: 360,
      });
    });

    it('stays silent for a shopper who turned price alerts off', async () => {
      await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });
      await http()
        .patch('/v1/notification-preferences')
        .set(auth(shopper))
        .send({ priceAlertsEnabled: false })
        .expect(200);

      await priceChanges(90, 120);

      expect((await inbox(shopper)).data).toHaveLength(0);
    });

    it('holds a message through quiet hours instead of dropping it', async () => {
      await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });

      // Quiet for the whole day, so whenever this runs the message waits.
      await http()
        .patch('/v1/notification-preferences')
        .set(auth(shopper))
        .send({ quietHoursStartUtc: 0, quietHoursEndUtc: 23 })
        .expect(200);

      await priceChanges(90, 120);

      const stored = await core.notification.findFirst({
        orderBy: { createdAt: 'desc' },
      });

      expect(stored).toMatchObject({ status: 'PENDING' });
      expect(stored!.deliverAt.getTime()).toBeGreaterThan(Date.now());

      // The sweep will not deliver it yet either.
      expect(await deliver.deliverDue()).toBe(0);
    });

    it('refuses half a quiet period', async () => {
      await http()
        .patch('/v1/notification-preferences')
        .set(auth(shopper))
        .send({ quietHoursStartUtc: 22 })
        .expect(400);
    });
  });

  describe('the inbox', () => {
    it('marks a message read, and says so once', async () => {
      await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });
      await priceChanges(90, 120);

      const [message] = (await inbox(shopper)).data;

      const first = await http()
        .post(`/v1/notifications/${message.id}/read`)
        .set(auth(shopper))
        .expect(200);
      const again = await http()
        .post(`/v1/notifications/${message.id}/read`)
        .set(auth(shopper))
        .expect(200);

      expect(first.body.readAt).not.toBeNull();
      expect(again.body.readAt).toBe(first.body.readAt);
      expect((await inbox(shopper)).unreadCount).toBe(0);
    });

    it('filters to unread', async () => {
      await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });
      await priceChanges(90, 120);

      const [message] = (await inbox(shopper)).data;
      await http()
        .post(`/v1/notifications/${message.id}/read`)
        .set(auth(shopper))
        .expect(200);

      const unread = await http()
        .get('/v1/notifications?unreadOnly=true')
        .set(auth(shopper))
        .expect(200);

      expect(unread.body.data).toHaveLength(0);
    });

    it('keeps another shopper out of a message', async () => {
      await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });
      await priceChanges(90, 120);

      const [message] = (await inbox(shopper)).data;

      await http()
        .post(`/v1/notifications/${message.id}/read`)
        .set(auth(intruder))
        .expect(403);
    });

    it('requires authentication', async () => {
      await http().get('/v1/notifications').expect(401);
      await http().get('/v1/price-alerts').expect(401);
    });
  });

  describe('delivery', () => {
    it('delivers a message and records that it was sent', async () => {
      await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });
      await priceChanges(90, 120);

      const stored = await core.notification.findFirst();
      expect(await deliver.execute(stored!.id)).toBe(true);

      const after = await core.notification.findUnique({ where: { id: stored!.id } });
      expect(after).toMatchObject({ status: 'SENT' });
      expect(after!.sentAt).not.toBeNull();
    });

    it('does not deliver the same message twice', async () => {
      await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });
      await priceChanges(90, 120);

      const stored = await core.notification.findFirst();
      await deliver.execute(stored!.id);

      expect(await deliver.execute(stored!.id)).toBe(false);
    });

    it('sweeps up a message whose delivery was missed', async () => {
      await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });
      await priceChanges(90, 120);

      expect(await deliver.deliverDue()).toBe(1);
      expect(await deliver.deliverDue()).toBe(0);
    });
  });
});
