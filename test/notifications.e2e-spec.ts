import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import request from 'supertest';
import type { App } from 'supertest/types';
import { CorePrismaService } from '../src/common/database/core-prisma.service.js';
import { EvaluatePriceAlertsUseCase } from '../src/notifications/application/evaluate-price-alerts.use-case.js';
import { DeliverNotificationUseCase } from '../src/notifications/application/deliver-notification.use-case.js';
import { PUSH_SENDER } from '../src/notifications/domain/notification.repository.port.js';
import { ExpoPushSender } from '../src/notifications/infrastructure/expo-push-sender.js';
import { NOTIFICATIONS_QUEUE } from '../src/notifications/infrastructure/notifications.queue.js';
import {
  createTestApp,
  registerWithRole,
  resetDatabase,
  uniqueEmail,
} from './helpers/test-app.js';

/**
 * Stands in for Expo's push service: records what it is sent, and answers
 * with whatever the test set up. Nothing in these tests reaches the internet.
 */
interface PushRequest {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
}
const expo = {
  server: undefined as Server | undefined,
  received: [] as PushRequest[][],
  /** One ticket per message; replaced per test. */
  tickets: (messages: PushRequest[]): unknown[] => messages.map(() => ({ status: 'ok', id: 'x' })),
  status: 200,
};

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
    evaluate.execute({ productId: milkId, storeId, priceCents, previousPriceCents, currency: 'ARS' });

  const inbox = async (token: string) =>
    (await http().get('/v1/notifications').set(auth(token)).expect(200)).body;

  beforeAll(async () => {
    expo.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        const messages = JSON.parse(raw) as PushRequest[];
        expo.received.push(messages);
        res.statusCode = expo.status;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ data: expo.tickets(messages) }));
      });
    });
    await new Promise<void>((resolve) => expo.server!.listen(0, '127.0.0.1', resolve));
    const pushUrl = `http://127.0.0.1:${(expo.server.address() as AddressInfo).port}/push`;

    // The real sender, pointed at the stand-in: everything but the address is
    // what runs in production.
    app = (await createTestApp((builder) =>
      builder.overrideProvider(PUSH_SENDER).useValue(new ExpoPushSender(pushUrl, null)),
    )) as INestApplication<App>;
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
    await new Promise((resolve) => expo.server?.close(resolve));
  });

  beforeEach(async () => {
    await core.notification.deleteMany();
    await core.priceAlert.deleteMany();
    await core.notificationPreferences.deleteMany();
    await core.deviceToken.deleteMany();
    expo.received = [];
    expo.status = 200;
    expo.tickets = (messages) => messages.map(() => ({ status: 'ok', id: 'x' }));
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
          productName: 'Leche Entera 1L',
          // Watching anywhere nearby: no store to name.
          storeName: null,
          supermarketName: null,
        }),
      ]);
    });

    it('names the store of an alert that watches one', async () => {
      const id = await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100, storeId });

      const alerts = await http().get('/v1/price-alerts').set(auth(shopper)).expect(200);

      expect(alerts.body.data.find((alert: { id: string }) => alert.id === id)).toMatchObject({
        storeName: expect.any(String),
        supermarketName: expect.any(String),
      });
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

    it('refuses half a place: latitude, longitude and radius come together', async () => {
      await http()
        .post('/v1/price-alerts')
        .set(auth(shopper))
        .send({ productId: milkId, type: 'BELOW_THRESHOLD', thresholdCents: 100, latitude: -34.6 })
        .expect(400);
    });

    it('never fires on a price in another currency, nor on a store outside its radius', async () => {
      // "Below $ 1.400" near the Obelisco, in pesos.
      await createAlert({
        type: 'BELOW_THRESHOLD',
        thresholdCents: 140000,
        currency: 'ARS',
        latitude: -34.6037,
        longitude: -58.3816,
        radiusKm: 5,
      });

      // 115 euro cents is "below" 140000 — and is no news to a peso alert.
      await evaluate.execute({ productId: milkId, storeId, priceCents: 115, previousPriceCents: 129, currency: 'EUR' });
      expect((await inbox(shopper)).data).toHaveLength(0);

      // A peso price at a store in range does fire.
      await evaluate.execute({ productId: milkId, storeId, priceCents: 132000, previousPriceCents: 150000, currency: 'ARS' });
      expect((await inbox(shopper)).data).toHaveLength(1);
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

    it('carries the facts behind the words, so a client can say them in its own language', async () => {
      await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });

      await priceChanges(90, 120);

      const { data } = await inbox(shopper);

      expect(data[0]).toMatchObject({
        reason: 'BELOW_THRESHOLD',
        priceCents: 90,
        previousPriceCents: 120,
        currency: 'ARS',
        productName: 'Leche Entera 1L',
        storeName: expect.any(String),
        supermarketName: expect.any(String),
      });
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
    // The app's own worker would otherwise race these tests for every
    // delivery job the evaluation enqueues, and win on a fast machine.
    let queue: Queue;

    beforeAll(async () => {
      queue = app.get<Queue>(getQueueToken(NOTIFICATIONS_QUEUE));
      await queue.pause();
    });

    afterAll(async () => {
      await queue.drain();
      await queue.resume();
    });

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

    describe('by email', () => {
      const MAILPIT = 'http://127.0.0.1:8025/api/v1';

      interface MailSummary {
        ID: string;
        Subject: string;
        To: { Address: string }[];
      }

      const mailTo = async (address: string): Promise<MailSummary[]> => {
        const response = await fetch(`${MAILPIT}/messages?limit=200`);
        const { messages } = (await response.json()) as { messages: MailSummary[] };
        return messages.filter((mail) => mail.To.some((to) => to.Address === address));
      };

      const shopperEmail = async () =>
        (await http().get('/v1/users/me').set(auth(shopper)).expect(200)).body.email as string;

      const optIn = () =>
        http()
          .patch('/v1/notification-preferences')
          .set(auth(shopper))
          .send({ emailEnabled: true })
          .expect(200);

      const deliverOne = async () => {
        await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });
        await priceChanges(90, 120);

        const stored = await core.notification.findFirst();
        expect(await deliver.execute(stored!.id)).toBe(true);
        return stored!;
      };

      /** The path and query of the link in the email, to call on the test server. */
      const unsubscribeLink = async (mailId: string): Promise<string> => {
        const response = await fetch(`${MAILPIT}/message/${mailId}`);
        const { Text } = (await response.json()) as { Text: string };
        const url = /Stop these emails: (\S+)/.exec(Text)![1];
        const { pathname, search } = new URL(url);
        return `${pathname}${search}`;
      };

      beforeEach(async () => {
        await fetch(`${MAILPIT}/messages`, { method: 'DELETE' });
      });

      it('records consent when a shopper turns email on', async () => {
        const response = await optIn();

        expect(response.body).toMatchObject({ emailEnabled: true, emailAvailable: true });
        expect(response.body.emailOptedInAt).not.toBeNull();
      });

      it('emails a shopper who opted in, alongside the inbox', async () => {
        await optIn();
        const stored = await deliverOne();

        const [mail] = await mailTo(await shopperEmail());
        expect(mail.Subject).toBe(stored.title);

        const headers = (await (
          await fetch(`${MAILPIT}/message/${mail.ID}/headers`)
        ).json()) as Record<string, string[]>;
        expect(headers['List-Unsubscribe'][0]).toMatch(/notification-emails\/unsubscribe\?token=/);
        expect(headers['List-Unsubscribe-Post']).toEqual(['List-Unsubscribe=One-Click']);

        const channels = await core.notificationChannelDelivery.findMany({
          where: { notificationId: stored.id },
        });
        expect(channels.map((row) => row.channel).sort()).toEqual(['email', 'in-app']);
        expect(channels.every((row) => row.sentAt !== null)).toBe(true);
      });

      it('emails nobody who has not opted in', async () => {
        await deliverOne();

        expect(await mailTo(await shopperEmail())).toHaveLength(0);
      });

      it('stops emailing from the link in the message, without a login', async () => {
        await optIn();
        await deliverOne();
        const [mail] = await mailTo(await shopperEmail());
        const link = await unsubscribeLink(mail.ID);

        // Opening the link only asks; a link scanner fetching it changes nothing.
        const page = await http().get(link).expect(200);
        expect(page.text).toContain('<form method="post">');
        expect(
          (await http().get('/v1/notification-preferences').set(auth(shopper))).body.emailEnabled,
        ).toBe(true);

        await http()
          .post(link)
          .type('form')
          .send('List-Unsubscribe=One-Click')
          .expect(200);

        const preferences = (
          await http().get('/v1/notification-preferences').set(auth(shopper)).expect(200)
        ).body;
        expect(preferences.emailEnabled).toBe(false);
        expect(preferences.emailOptedOutAt).not.toBeNull();
      });

      it('answers a forged link exactly as a genuine one', async () => {
        await optIn();

        const response = await http()
          .post('/v1/notification-emails/unsubscribe?token=forged.token')
          .expect(200);

        expect(response.text).toContain('Email alerts are off');
        expect(
          (await http().get('/v1/notification-preferences').set(auth(shopper))).body.emailEnabled,
        ).toBe(true);
      });
    });

    it('sweeps up a message whose delivery was missed', async () => {
      await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });
      await priceChanges(90, 120);

      expect(await deliver.deliverDue()).toBe(1);
      expect(await deliver.deliverDue()).toBe(0);
    });
  });

  describe('push to phones', () => {
    const PHONE = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
    const OTHER_PHONE = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

    const register = (token: string, who = shopper, platform = 'ios') =>
      http().post('/v1/devices').set(auth(who)).send({ token, platform });

    let queue: Queue;

    beforeAll(async () => {
      queue = app.get<Queue>(getQueueToken(NOTIFICATIONS_QUEUE));
      await queue.pause();
    });

    afterAll(async () => {
      await queue.drain();
      await queue.resume();
    });

    it('registers a phone, and registering it again is the same phone', async () => {
      const first = await register(PHONE).expect(201);
      const again = await register(PHONE).expect(201);

      expect(again.body.id).toBe(first.body.id);
      expect(first.body).toMatchObject({ platform: 'ios' });
      expect(await core.deviceToken.count()).toBe(1);
    });

    it('refuses what is not an Expo push token, and needs authentication', async () => {
      await register('not-a-token').expect(400);
      await register(PHONE, shopper, 'windows').expect(400);
      await http().post('/v1/devices').send({ token: PHONE, platform: 'ios' }).expect(401);
      await http().post('/v1/devices/test').expect(401);
    });

    it('moves a phone to whoever signs in on it', async () => {
      await register(PHONE, shopper).expect(201);
      await register(PHONE, intruder).expect(201);

      expect(await core.deviceToken.count()).toBe(1);

      // The first account no longer has it: a test push finds no phone.
      const test = await http().post('/v1/devices/test').set(auth(shopper)).expect(200);
      expect(test.body).toEqual({ devices: 0, delivered: 0 });

      // And the account that signed in on it has it.
      const theirs = await http().post('/v1/devices/test').set(auth(intruder)).expect(200);
      expect(theirs.body).toEqual({ devices: 1, delivered: 1 });
    });

    it('forgets a phone on request, and forgetting an unknown one is fine', async () => {
      await register(PHONE).expect(201);

      await http().delete(`/v1/devices/${encodeURIComponent(PHONE)}`).set(auth(shopper)).expect(204);
      await http().delete(`/v1/devices/${encodeURIComponent(PHONE)}`).set(auth(shopper)).expect(204);

      expect(await core.deviceToken.count()).toBe(0);
    });

    it('does not let one account forget another\'s phone', async () => {
      await register(PHONE, intruder).expect(201);

      await http().delete(`/v1/devices/${encodeURIComponent(PHONE)}`).set(auth(shopper)).expect(204);

      expect(await core.deviceToken.count()).toBe(1);
    });

    it('sends a test push, in Spanish, to every phone', async () => {
      await register(PHONE).expect(201);
      await register(OTHER_PHONE, shopper, 'android').expect(201);

      const test = await http().post('/v1/devices/test').set(auth(shopper)).expect(200);

      expect(test.body).toEqual({ devices: 2, delivered: 2 });
      expect(expo.received).toHaveLength(1);
      expect(expo.received[0].map((m) => m.to).sort()).toEqual([PHONE, OTHER_PHONE].sort());
      expect(expo.received[0][0]).toMatchObject({
        title: 'Garner',
        body: 'Si ves esto, los avisos funcionan en este teléfono.',
      });
    });

    it('says so when there is no phone, without calling the push service', async () => {
      const test = await http().post('/v1/devices/test').set(auth(shopper)).expect(200);

      expect(test.body).toEqual({ devices: 0, delivered: 0 });
      expect(expo.received).toHaveLength(0);
    });

    it('forgets a phone the push service says is gone', async () => {
      await register(PHONE).expect(201);
      expo.tickets = (messages) =>
        messages.map(() => ({ status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }));

      const test = await http().post('/v1/devices/test').set(auth(shopper)).expect(200);

      expect(test.body).toEqual({ devices: 1, delivered: 0 });
      expect(await core.deviceToken.count()).toBe(0);
    });

    it('answers 502 when the push service cannot be used', async () => {
      await register(PHONE).expect(201);
      expo.status = 503;

      await http().post('/v1/devices/test').set(auth(shopper)).expect(502);
      expect(await core.deviceToken.count()).toBe(1);
    });

    it('pushes a price alert, in Spanish, to the phones of whoever set it', async () => {
      await register(PHONE).expect(201);
      await register(OTHER_PHONE, intruder).expect(201);
      await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });
      await priceChanges(90, 120);

      const stored = await core.notification.findFirstOrThrow();
      expect(await deliver.execute(stored.id)).toBe(true);

      expect(expo.received).toHaveLength(1);
      expect(expo.received[0]).toHaveLength(1);
      expect(expo.received[0][0]).toMatchObject({
        to: PHONE,
        title: 'Leche Entera 1L bajó a $ 0,90',
        body: expect.stringContaining('Coto Centro'),
        data: { notificationId: stored.id, productId: milkId },
      });
      expect((await core.notification.findUniqueOrThrow({ where: { id: stored.id } })).status).toBe('SENT');
    });

    it('retries a push when the service is down, and does not send it twice once it has gone', async () => {
      await register(PHONE).expect(201);
      await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });
      await priceChanges(90, 120);
      const stored = await core.notification.findFirstOrThrow();

      expo.status = 503;
      await expect(deliver.execute(stored.id)).rejects.toThrow();
      expect((await core.notification.findUniqueOrThrow({ where: { id: stored.id } })).status).not.toBe('SENT');

      expo.status = 200;
      expect(await deliver.execute(stored.id)).toBe(true);
      expect(await deliver.execute(stored.id)).toBe(false);
      expect(expo.received.filter((batch) => batch.length > 0 && batch[0].title.includes('bajó'))).toHaveLength(2);
    });

    it('sends nothing to someone with no phone', async () => {
      await createAlert({ type: 'BELOW_THRESHOLD', thresholdCents: 100 });
      await priceChanges(90, 120);
      const stored = await core.notification.findFirstOrThrow();

      expect(await deliver.execute(stored.id)).toBe(true);
      expect(expo.received).toHaveLength(0);
    });
  });
});
