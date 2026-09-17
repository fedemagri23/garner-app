import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { DomainEvent } from '../src/common/events/domain-event.js';
import { EventBus } from '../src/common/events/event-bus.js';
import {
  createTestApp,
  registerWithRole,
  resetDatabase,
  uniqueEmail,
} from './helpers/test-app.js';

/**
 * The planning-to-shopping flow end to end: build a list at home, take it to a
 * store, record what things actually cost, finish the trip — with the retries
 * a phone on a bad connection produces along the way.
 */
describe('Shopping lists and sessions (e2e)', () => {
  let app: INestApplication<App>;
  let shopper: string;
  let intruder: string;
  let milkId: string;
  let breadId: string;
  let retiredId: string;
  let storeId: string;

  const completedEvents: DomainEvent[] = [];

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  const register = async (prefix: string): Promise<string> => {
    const response = await http()
      .post('/v1/auth/register')
      .send({
        email: uniqueEmail(prefix),
        password: 'correct-horse-battery',
        displayName: 'Shopper',
      })
      .expect(201);

    return response.body.accessToken;
  };

  /** A list with milk ×2 at 1.25 and bread ×1 at 0.89 — 3.39 expected. */
  const createStockedList = async (name = 'Weekly groceries') => {
    const list = await http()
      .post('/v1/shopping-lists')
      .set(auth(shopper))
      .send({ name, currency: 'ARS' })
      .expect(201);

    await http()
      .post(`/v1/shopping-lists/${list.body.id}/items`)
      .set(auth(shopper))
      .send({ productId: milkId, quantity: 2, expectedUnitPriceCents: 125 })
      .expect(201);

    const stocked = await http()
      .post(`/v1/shopping-lists/${list.body.id}/items`)
      .set(auth(shopper))
      .send({ productId: breadId, quantity: 1, expectedUnitPriceCents: 89 })
      .expect(201);

    return stocked.body;
  };

  beforeAll(async () => {
    app = (await createTestApp()) as INestApplication<App>;
    await resetDatabase(app);

    app
      .get(EventBus)
      .subscribe('ShoppingSessionCompleted', (event) => {
        completedEvents.push(event);
      });

    shopper = await register('shopping');
    intruder = await register('intruder');

    const curator = (await registerWithRole(app, 'ADMIN')).accessToken;

    const category = await http()
      .post('/v1/categories')
      .set(auth(curator))
      .send({ name: 'Almacén' })
      .expect(201);

    const product = async (name: string) =>
      (
        await http()
          .post('/v1/products')
          .set(auth(curator))
          .send({ name, categoryId: category.body.id, unit: 'UNIT' })
          .expect(201)
      ).body.id as string;

    milkId = await product('Leche Entera 1L');
    breadId = await product('Pan Lactal 500g');
    retiredId = await product('Producto Discontinuado');

    await http()
      .patch(`/v1/products/${retiredId}`)
      .set(auth(curator))
      .send({ isActive: false })
      .expect(200);

    const chain = await http()
      .post('/v1/supermarkets')
      .set(auth(curator))
      .send({ name: 'Día' })
      .expect(201);

    const store = await http()
      .post('/v1/stores')
      .set(auth(curator))
      .send({
        supermarketId: chain.body.id,
        name: 'Día Palermo',
        addressLine: 'Av. Santa Fe 3000',
        city: 'Buenos Aires',
        country: 'AR',
        latitude: -34.588,
        longitude: -58.411,
      })
      .expect(201);
    storeId = store.body.id;
  });

  afterAll(async () => {
    await resetDatabase(app);
    await app.close();
  });

  describe('lists', () => {
    it('computes the expected total on the server', async () => {
      const list = await createStockedList();

      expect(list.totals).toEqual({
        expectedTotalCents: 339,
        itemCount: 2,
        unpricedItemCount: 0,
      });
      expect(list.items[0]).toMatchObject({
        quantity: 2,
        expectedUnitPriceCents: 125,
        expectedLineTotalCents: 250,
        product: { name: 'Leche Entera 1L' },
      });
    });

    it('recomputes totals when a quantity changes', async () => {
      const list = await createStockedList();
      const milk = list.items[0];

      const updated = await http()
        .patch(`/v1/shopping-lists/${list.id}/items/${milk.id}`)
        .set(auth(shopper))
        .send({ quantity: 1.5 })
        .expect(200);

      expect(updated.body.totals.expectedTotalCents).toBe(188 + 89);
    });

    it('flags items without a price rather than counting them as free', async () => {
      const list = await createStockedList();

      const updated = await http()
        .patch(`/v1/shopping-lists/${list.id}/items/${list.items[1].id}`)
        .set(auth(shopper))
        .send({ expectedUnitPriceCents: null })
        .expect(200);

      expect(updated.body.totals).toMatchObject({
        expectedTotalCents: 250,
        unpricedItemCount: 1,
      });
    });

    it('does not let a client set the total', async () => {
      const list = await createStockedList();

      await http()
        .patch(`/v1/shopping-lists/${list.id}`)
        .set(auth(shopper))
        .send({ totals: { expectedTotalCents: 1 } })
        .expect(400);
    });

    it('creates a list once when the create is retried with the same id', async () => {
      const id = randomUUID();
      const body = { id, name: 'Party', currency: 'ARS' };

      await http().post('/v1/shopping-lists').set(auth(shopper)).send(body).expect(201);
      const retry = await http()
        .post('/v1/shopping-lists')
        .set(auth(shopper))
        .send(body)
        .expect(201);

      expect(retry.body.id).toBe(id);

      const mine = await http()
        .get('/v1/shopping-lists?pageSize=100')
        .set(auth(shopper))
        .expect(200);
      expect(
        mine.body.data.filter((list: { id: string }) => list.id === id),
      ).toHaveLength(1);
    });

    it('adds an item once when the add is retried with the same id', async () => {
      const list = await createStockedList();
      const itemId = randomUUID();
      const body = { id: itemId, productId: milkId, quantity: 1 };

      await http()
        .post(`/v1/shopping-lists/${list.id}/items`)
        .set(auth(shopper))
        .send(body)
        .expect(201);
      const retry = await http()
        .post(`/v1/shopping-lists/${list.id}/items`)
        .set(auth(shopper))
        .send(body)
        .expect(201);

      expect(retry.body.totals.itemCount).toBe(3);
    });

    it('reorders items and follows the new order', async () => {
      const list = await createStockedList();
      const [milk, bread] = list.items;

      const reordered = await http()
        .put(`/v1/shopping-lists/${list.id}/items/order`)
        .set(auth(shopper))
        .send({ itemIds: [bread.id, milk.id] })
        .expect(200);

      expect(reordered.body.items.map((item: { id: string }) => item.id)).toEqual([
        bread.id,
        milk.id,
      ]);
    });

    it('sorts by product name when that preference is set', async () => {
      const list = await createStockedList();

      const sorted = await http()
        .patch(`/v1/shopping-lists/${list.id}`)
        .set(auth(shopper))
        .send({ sortMode: 'NAME' })
        .expect(200);

      expect(
        sorted.body.items.map((item: { product: { name: string } }) => item.product.name),
      ).toEqual(['Leche Entera 1L', 'Pan Lactal 500g']);
    });

    it('duplicates a list with its items and prices', async () => {
      const list = await createStockedList('Monthly');

      const copy = await http()
        .post(`/v1/shopping-lists/${list.id}/duplicate`)
        .set(auth(shopper))
        .send({})
        .expect(201);

      expect(copy.body.id).not.toBe(list.id);
      expect(copy.body.name).toBe('Monthly (copy)');
      expect(copy.body.totals).toEqual(list.totals);
    });

    it('refuses a retired product', async () => {
      const list = await createStockedList();

      await http()
        .post(`/v1/shopping-lists/${list.id}/items`)
        .set(auth(shopper))
        .send({ productId: retiredId, quantity: 1 })
        .expect(422);
    });

    it('removes an item, and removing it again still succeeds', async () => {
      const list = await createStockedList();
      const bread = list.items[1];

      await http()
        .delete(`/v1/shopping-lists/${list.id}/items/${bread.id}`)
        .set(auth(shopper))
        .expect(204);
      await http()
        .delete(`/v1/shopping-lists/${list.id}/items/${bread.id}`)
        .set(auth(shopper))
        .expect(204);

      const after = await http()
        .get(`/v1/shopping-lists/${list.id}`)
        .set(auth(shopper))
        .expect(200);
      expect(after.body.totals.itemCount).toBe(1);
    });

    it('deletes a list, and deleting it again still succeeds', async () => {
      const list = await createStockedList();

      await http().delete(`/v1/shopping-lists/${list.id}`).set(auth(shopper)).expect(204);
      await http().delete(`/v1/shopping-lists/${list.id}`).set(auth(shopper)).expect(204);
      await http().get(`/v1/shopping-lists/${list.id}`).set(auth(shopper)).expect(404);
    });
  });

  describe('list ownership', () => {
    it('keeps another user out of a list, for every operation', async () => {
      const list = await createStockedList();
      const item = list.items[0];

      await http().get(`/v1/shopping-lists/${list.id}`).set(auth(intruder)).expect(403);
      await http()
        .patch(`/v1/shopping-lists/${list.id}`)
        .set(auth(intruder))
        .send({ name: 'Mine now' })
        .expect(403);
      await http()
        .post(`/v1/shopping-lists/${list.id}/items`)
        .set(auth(intruder))
        .send({ productId: milkId, quantity: 1 })
        .expect(403);
      await http()
        .patch(`/v1/shopping-lists/${list.id}/items/${item.id}`)
        .set(auth(intruder))
        .send({ quantity: 50 })
        .expect(403);
      await http()
        .delete(`/v1/shopping-lists/${list.id}/items/${item.id}`)
        .set(auth(intruder))
        .expect(403);
      await http()
        .post(`/v1/shopping-lists/${list.id}/duplicate`)
        .set(auth(intruder))
        .send({})
        .expect(403);
      await http().delete(`/v1/shopping-lists/${list.id}`).set(auth(intruder)).expect(403);

      // And the list is untouched.
      const after = await http()
        .get(`/v1/shopping-lists/${list.id}`)
        .set(auth(shopper))
        .expect(200);
      expect(after.body.totals.expectedTotalCents).toBe(339);
    });

    it('does not show another user’s lists in their index', async () => {
      await createStockedList();

      const theirs = await http().get('/v1/shopping-lists').set(auth(intruder)).expect(200);
      expect(theirs.body.meta.totalItems).toBe(0);
    });

    it('refuses to take over a list id another user created', async () => {
      const list = await createStockedList();

      await http()
        .post('/v1/shopping-lists')
        .set(auth(intruder))
        .send({ id: list.id, name: 'Hijack', currency: 'ARS' })
        .expect(409);
    });

    it('requires authentication', async () => {
      await http().get('/v1/shopping-lists').expect(401);
    });
  });

  describe('shopping sessions', () => {
    const start = (listId: string, extra: Record<string, unknown> = {}) =>
      http()
        .post('/v1/shopping-sessions')
        .set(auth(shopper))
        .send({ listId, ...extra });

    const record = (
      sessionId: string,
      itemId: string,
      body: Record<string, unknown>,
    ) =>
      http()
        .patch(`/v1/shopping-sessions/${sessionId}/items/${itemId}`)
        .set(auth(shopper))
        .send(body);

    it('starts a trip from a list with the list’s items and expected total', async () => {
      const list = await createStockedList();

      const session = await start(list.id, { storeId }).expect(201);

      expect(session.body).toMatchObject({
        listId: list.id,
        listName: 'Weekly groceries',
        currency: 'ARS',
        status: 'ACTIVE',
        store: { id: storeId, supermarketName: 'Día' },
        totals: {
          expectedTotalCents: 339,
          actualTotalCents: 0,
          remainingExpectedTotalCents: 339,
          projectedTotalCents: 339,
          itemCount: 2,
          purchasedItemCount: 0,
        },
      });
    });

    it('returns the trip in progress instead of starting a second one', async () => {
      const list = await createStockedList();

      const first = await start(list.id).expect(201);
      const again = await start(list.id).expect(201);

      expect(again.body.id).toBe(first.body.id);
    });

    it('refuses to start a trip from an empty list', async () => {
      const list = await http()
        .post('/v1/shopping-lists')
        .set(auth(shopper))
        .send({ name: 'Empty', currency: 'ARS' })
        .expect(201);

      await start(list.body.id).expect(409);
    });

    it('keeps a running total as prices are recorded', async () => {
      const list = await createStockedList();
      const session = (await start(list.id).expect(201)).body;
      const [milk, bread] = session.items;

      // Milk cost more than expected.
      const afterMilk = await record(session.id, milk.id, {
        isPurchased: true,
        actualUnitPriceCents: 132,
      }).expect(200);

      expect(afterMilk.body.totals).toMatchObject({
        expectedTotalCents: 339,
        actualTotalCents: 264,
        remainingExpectedTotalCents: 89,
        projectedTotalCents: 353,
        purchasedItemCount: 1,
      });

      // Bread confirmed at the expected price, without typing one.
      const afterBread = await record(session.id, bread.id, {
        isPurchased: true,
      }).expect(200);

      expect(afterBread.body.totals).toMatchObject({
        actualTotalCents: 264 + 89,
        remainingExpectedTotalCents: 0,
        projectedTotalCents: 353,
        purchasedItemCount: 2,
      });
      expect(afterBread.body.items[1].actualLineTotalCents).toBe(89);
    });

    it('lands the same state when an item update is retried', async () => {
      const list = await createStockedList();
      const session = (await start(list.id).expect(201)).body;
      const milk = session.items[0];
      const body = { isPurchased: true, actualUnitPriceCents: 132 };

      const first = await record(session.id, milk.id, body).expect(200);
      const retry = await record(session.id, milk.id, body).expect(200);

      expect(retry.body.totals).toEqual(first.body.totals);
      expect(retry.body.items[0].purchasedAt).toBe(first.body.items[0].purchasedAt);
    });

    it('keeps the purchase time an offline client reports', async () => {
      const list = await createStockedList();
      const session = (await start(list.id).expect(201)).body;
      const purchasedAt = new Date(Date.parse(session.startedAt) + 1000).toISOString();

      const updated = await record(session.id, session.items[0].id, {
        isPurchased: true,
        purchasedAt,
      }).expect(200);

      expect(updated.body.items[0].purchasedAt).toBe(purchasedAt);
    });

    it('pauses and resumes, still accepting prices while paused', async () => {
      const list = await createStockedList();
      const session = (await start(list.id).expect(201)).body;

      const paused = await http()
        .post(`/v1/shopping-sessions/${session.id}/pause`)
        .set(auth(shopper))
        .expect(200);
      expect(paused.body.status).toBe('PAUSED');
      expect(paused.body.pausedAt).not.toBeNull();

      await record(session.id, session.items[0].id, {
        actualUnitPriceCents: 140,
      }).expect(200);

      const resumed = await http()
        .post(`/v1/shopping-sessions/${session.id}/resume`)
        .set(auth(shopper))
        .expect(200);
      expect(resumed.body).toMatchObject({ status: 'ACTIVE', pausedAt: null });
    });

    it('completes once, however many times completion is retried', async () => {
      const list = await createStockedList();
      const session = (await start(list.id, { storeId }).expect(201)).body;

      await record(session.id, session.items[0].id, {
        isPurchased: true,
        actualUnitPriceCents: 132,
      }).expect(200);

      const before = completedEvents.length;

      const [first, second] = await Promise.all([
        http().post(`/v1/shopping-sessions/${session.id}/complete`).set(auth(shopper)),
        http().post(`/v1/shopping-sessions/${session.id}/complete`).set(auth(shopper)),
      ]);
      const third = await http()
        .post(`/v1/shopping-sessions/${session.id}/complete`)
        .set(auth(shopper));

      expect([first.status, second.status, third.status]).toEqual([200, 200, 200]);
      expect(third.body.status).toBe('COMPLETED');
      expect(third.body.completedAt).toBe(first.body.completedAt);

      const published = completedEvents.slice(before);
      expect(published).toHaveLength(1);
      expect(published[0].payload).toMatchObject({
        sessionId: session.id,
        storeId,
        currency: 'ARS',
        purchases: [
          { productId: milkId, quantity: 2, actualUnitPriceCents: 132, storeId },
        ],
      });
    });

    it('accepts a replayed update after completion but refuses a new one', async () => {
      const list = await createStockedList();
      const session = (await start(list.id).expect(201)).body;
      const milk = session.items[0];
      const body = { isPurchased: true, actualUnitPriceCents: 132 };

      await record(session.id, milk.id, body).expect(200);
      await http()
        .post(`/v1/shopping-sessions/${session.id}/complete`)
        .set(auth(shopper))
        .expect(200);

      await record(session.id, milk.id, body).expect(200);
      await record(session.id, milk.id, { actualUnitPriceCents: 999 }).expect(409);
    });

    it('rejects contradictory transitions', async () => {
      const list = await createStockedList();
      const session = (await start(list.id).expect(201)).body;

      await http()
        .post(`/v1/shopping-sessions/${session.id}/abandon`)
        .set(auth(shopper))
        .expect(200);

      await http()
        .post(`/v1/shopping-sessions/${session.id}/complete`)
        .set(auth(shopper))
        .expect(409);
      await http()
        .post(`/v1/shopping-sessions/${session.id}/resume`)
        .set(auth(shopper))
        .expect(409);
    });

    it('lets a new trip start once the previous one is finished', async () => {
      const list = await createStockedList();
      const first = (await start(list.id).expect(201)).body;

      await http()
        .post(`/v1/shopping-sessions/${first.id}/complete`)
        .set(auth(shopper))
        .expect(200);

      const second = await start(list.id).expect(201);
      expect(second.body.id).not.toBe(first.id);
    });

    it('is untouched by later edits to the list, and survives its deletion', async () => {
      const list = await createStockedList();
      const session = (await start(list.id).expect(201)).body;

      await http()
        .patch(`/v1/shopping-lists/${list.id}/items/${list.items[0].id}`)
        .set(auth(shopper))
        .send({ quantity: 10 })
        .expect(200);
      await http().delete(`/v1/shopping-lists/${list.id}`).set(auth(shopper)).expect(204);

      const after = await http()
        .get(`/v1/shopping-sessions/${session.id}`)
        .set(auth(shopper))
        .expect(200);

      expect(after.body).toMatchObject({
        listId: null,
        listName: 'Weekly groceries',
        totals: { expectedTotalCents: 339 },
      });
    });

    it('filters my trips by status', async () => {
      const list = await createStockedList();
      const session = (await start(list.id).expect(201)).body;
      await http()
        .post(`/v1/shopping-sessions/${session.id}/abandon`)
        .set(auth(shopper))
        .expect(200);

      const abandoned = await http()
        .get('/v1/shopping-sessions?status=ABANDONED&pageSize=100')
        .set(auth(shopper))
        .expect(200);

      expect(
        abandoned.body.data.every((trip: { status: string }) => trip.status === 'ABANDONED'),
      ).toBe(true);
      expect(
        abandoned.body.data.some((trip: { id: string }) => trip.id === session.id),
      ).toBe(true);
    });
  });

  describe('session ownership', () => {
    it('keeps another user out of a trip, for every operation', async () => {
      const list = await createStockedList();
      const session = (
        await http()
          .post('/v1/shopping-sessions')
          .set(auth(shopper))
          .send({ listId: list.id })
          .expect(201)
      ).body;

      await http().get(`/v1/shopping-sessions/${session.id}`).set(auth(intruder)).expect(403);
      await http()
        .patch(`/v1/shopping-sessions/${session.id}/items/${session.items[0].id}`)
        .set(auth(intruder))
        .send({ isPurchased: true })
        .expect(403);
      for (const action of ['pause', 'resume', 'complete', 'abandon']) {
        await http()
          .post(`/v1/shopping-sessions/${session.id}/${action}`)
          .set(auth(intruder))
          .expect(403);
      }

      const after = await http()
        .get(`/v1/shopping-sessions/${session.id}`)
        .set(auth(shopper))
        .expect(200);
      expect(after.body).toMatchObject({
        status: 'ACTIVE',
        totals: { purchasedItemCount: 0 },
      });
    });

    it('refuses to start a trip from another user’s list', async () => {
      const list = await createStockedList();

      await http()
        .post('/v1/shopping-sessions')
        .set(auth(intruder))
        .send({ listId: list.id })
        .expect(403);
    });

    it('does not show another user’s trips', async () => {
      const theirs = await http()
        .get('/v1/shopping-sessions')
        .set(auth(intruder))
        .expect(200);

      expect(theirs.body.meta.totalItems).toBe(0);
    });
  });
});
