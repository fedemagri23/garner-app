import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { IntelligencePrismaService } from '../src/common/database/intelligence-prisma.service.js';
import {
  createTestApp,
  registerWithRole,
  resetDatabase,
  uniqueEmail,
} from './helpers/test-app.js';

const HOME = { latitude: -34.6037, longitude: -58.3816 };

/** Roughly this many kilometres south of home. */
const kmSouth = (km: number) => HOME.latitude - km / 111.32;

describe('Shopping optimization (e2e)', () => {
  let app: INestApplication<App>;
  let intelligence: IntelligencePrismaService;

  let shopper: string;
  let intruder: string;
  let curator: string;
  let categoryId: string;

  let milkId: string;
  let breadId: string;
  let caviarId: string;
  let nearStore: string;
  let cheapMilkStore: string;
  let cheapBreadStore: string;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  const setPrice = async (
    productId: string,
    storeId: string,
    priceCents: number,
  ) => {
    await intelligence.derivedPrice.upsert({
      where: { productId_storeId: { productId, storeId } },
      create: {
        productId,
        storeId,
        currency: 'ARS',
        priceCents,
        minPriceCents: priceCents,
        maxPriceCents: priceCents,
        confidence: 0.9,
        confidenceLevel: 'VERY_RECENT',
        observationCount: 3,
        lastObservedAt: new Date(),
      },
      update: { priceCents },
    });
  };

  /** Creates a list and returns its id. */
  const createList = async (
    items: { productId: string; quantity: number }[],
  ): Promise<string> => {
    const list = await http()
      .post('/v1/shopping-lists')
      .set(auth(shopper))
      .send({ name: `Trip ${randomUUID()}`, currency: 'ARS' })
      .expect(201);

    for (const item of items) {
      await http()
        .post(`/v1/shopping-lists/${list.body.id}/items`)
        .set(auth(shopper))
        .send(item)
        .expect(201);
    }

    return list.body.id;
  };

  /** Asks for an optimization and waits for the worker to answer. */
  const optimize = async (
    listId: string,
    body: Record<string, unknown> = {},
  ) => {
    const accepted = await http()
      .post(`/v1/shopping-lists/${listId}/optimize`)
      .set(auth(shopper))
      // Limits are wide open unless a test sets them: each one has a test of
      // its own, and they should not silently shape the others.
      .send({
        ...HOME,
        radiusKm: 20,
        minSavingsCentsPerExtraStore: 0,
        maxAdditionalDistanceKm: 50,
        maxAdditionalMinutes: 240,
        ...body,
      });

    expect([200, 202]).toContain(accepted.status);

    const deadline = Date.now() + 15_000;

    while (Date.now() < deadline) {
      const current = await http()
        .get(`/v1/optimizations/${accepted.body.id}`)
        .set(auth(shopper))
        .expect(200);

      if (current.body.status === 'COMPLETED' || current.body.status === 'FAILED') {
        return { ...current.body, acceptedStatus: accepted.status };
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error('Optimization did not finish in time');
  };

  beforeAll(async () => {
    app = (await createTestApp()) as INestApplication<App>;
    await resetDatabase(app);
    intelligence = app.get(IntelligencePrismaService);

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

    shopper = await register('optimizer');
    intruder = await register('intruder');
    curator = (await registerWithRole(app, 'ADMIN')).accessToken;

    categoryId = (
      await http()
        .post('/v1/categories')
        .set(auth(curator))
        .send({ name: 'Almacén' })
        .expect(201)
    ).body.id;

    const product = async (name: string) =>
      (
        await http()
          .post('/v1/products')
          .set(auth(curator))
          .send({ name, categoryId, unit: 'UNIT' })
          .expect(201)
      ).body.id as string;

    milkId = await product('Leche Entera 1L');
    breadId = await product('Pan Lactal 500g');
    caviarId = await product('Caviar Importado 50g');

    const chain = async (name: string) =>
      (
        await http()
          .post('/v1/supermarkets')
          .set(auth(curator))
          .send({ name })
          .expect(201)
      ).body.id as string;

    const store = async (name: string, supermarketId: string, km: number) =>
      (
        await http()
          .post('/v1/stores')
          .set(auth(curator))
          .send({
            supermarketId,
            name,
            addressLine: 'Av. Siempre Viva 100',
            city: 'Buenos Aires',
            country: 'AR',
            latitude: kmSouth(km),
            longitude: HOME.longitude,
          })
          .expect(201)
      ).body.id as string;

    const [chainA, chainB, chainC] = await Promise.all([
      chain('Carrefour'),
      chain('Día'),
      chain('Jumbo'),
    ]);

    nearStore = await store('Carrefour Centro', chainA, 0.5);
    cheapMilkStore = await store('Día Sur', chainB, 3);
    cheapBreadStore = await store('Jumbo Oeste', chainC, 4);

    // The near store carries everything, at a price. The others are cheaper
    // for one item each.
    await setPrice(milkId, nearStore, 200);
    await setPrice(breadId, nearStore, 200);
    await setPrice(milkId, cheapMilkStore, 100);
    await setPrice(breadId, cheapMilkStore, 250);
    await setPrice(breadId, cheapBreadStore, 100);
  });

  afterAll(async () => {
    await resetDatabase(app);
    await app.close();
  });

  describe('a plan for a list', () => {
    let listId: string;

    beforeAll(async () => {
      listId = await createList([
        { productId: milkId, quantity: 1 },
        { productId: breadId, quantity: 2 },
      ]);
    });

    it('accepts the question and answers it in the background', async () => {
      const result = await optimize(listId, { mode: 'CHEAPEST', maxStores: 3 });

      expect(result.acceptedStatus).toBe(202);
      expect(result.status).toBe('COMPLETED');
      expect(result.result.cheapest).not.toBeNull();
    });

    it('assigns each product to the cheapest store, with a route and totals', async () => {
      const result = await optimize(listId, { mode: 'CHEAPEST', maxStores: 3 });
      const plan = result.result.cheapest;

      // Milk 100 at Día, two bread at 100 at Jumbo.
      expect(plan.totalCents).toBe(300);
      expect(plan.stores).toHaveLength(2);

      const orders = plan.stores.map((store: { order: number }) => store.order);
      expect(orders).toEqual([1, 2]);

      const assigned = plan.stores.flatMap(
        (store: { storeName: string; items: { productName: string }[] }) =>
          store.items.map((item) => [store.storeName, item.productName]),
      );
      expect(assigned).toEqual(
        expect.arrayContaining([
          ['Día Sur', 'Leche Entera 1L'],
          ['Jumbo Oeste', 'Pan Lactal 500g'],
        ]),
      );

      const subtotals = plan.stores.reduce(
        (sum: number, store: { subtotalCents: number }) => sum + store.subtotalCents,
        0,
      );
      expect(subtotals).toBe(plan.totalCents);
      expect(plan.travelDistanceKm).toBeGreaterThan(0);
      expect(plan.travelMinutes).toBeGreaterThan(0);
    });

    it('offers all three alternatives, simplest being one store', async () => {
      const { result } = await optimize(listId, { maxStores: 3 });

      expect(result.simplest.stores).toHaveLength(1);
      expect(result.simplest.stores[0].storeName).toBe('Carrefour Centro');
      expect(result.simplest.savingsCents).toBe(0);

      expect(result.cheapest.totalCents).toBeLessThan(result.simplest.totalCents);
      expect(result.cheapest.savingsCents).toBeGreaterThan(0);
      expect(result.bestBalance).not.toBeNull();
    });

    it('counts quantities, not just unit prices', async () => {
      const bulkList = await createList([{ productId: breadId, quantity: 10 }]);

      const { result } = await optimize(bulkList, { mode: 'CHEAPEST', maxStores: 2 });

      expect(result.cheapest.totalCents).toBe(1000);
    });

    it('reports what no nearby store sells, and plans the rest', async () => {
      const withCaviar = await createList([
        { productId: milkId, quantity: 1 },
        { productId: caviarId, quantity: 1 },
      ]);

      const { result } = await optimize(withCaviar, { maxStores: 2 });

      expect(result.unavailableProducts).toEqual(['Caviar Importado 50g']);
      expect(result.cheapest.missingProducts).toEqual(['Caviar Importado 50g']);
      expect(result.cheapest.stores.length).toBeGreaterThan(0);
    });

    it('reuses a recent answer to the same question', async () => {
      const first = await optimize(listId, { mode: 'CHEAPEST', maxStores: 3 });
      const again = await optimize(listId, { mode: 'CHEAPEST', maxStores: 3 });

      expect(again.acceptedStatus).toBe(200);
      expect(again.id).toBe(first.id);
    });

    it('asks again when the list changes', async () => {
      const changing = await createList([{ productId: milkId, quantity: 1 }]);
      const before = await optimize(changing, { maxStores: 2 });

      await http()
        .post(`/v1/shopping-lists/${changing}/items`)
        .set(auth(shopper))
        .send({ productId: breadId, quantity: 1 })
        .expect(201);

      const after = await optimize(changing, { maxStores: 2 });

      expect(after.id).not.toBe(before.id);
      expect(after.result.cheapest.totalCents).toBeGreaterThan(
        before.result.cheapest.totalCents,
      );
    });
  });

  describe('respecting the shopper’s limits', () => {
    let listId: string;

    beforeAll(async () => {
      listId = await createList([
        { productId: milkId, quantity: 1 },
        { productId: breadId, quantity: 2 },
      ]);
    });

    it('never recommends more stores than allowed, and says what it refused', async () => {
      const { result } = await optimize(listId, { maxStores: 1 });

      expect(result.cheapest.stores).toHaveLength(1);

      const refused = result.rejectedCheaperAlternatives[0];
      expect(refused.plan.totalCents).toBeLessThan(result.cheapest.totalCents);
      expect(refused.violations).toContain('TOO_MANY_STORES');
    });

    it('will not go further than the shopper agreed to', async () => {
      const { result } = await optimize(listId, {
        maxStores: 3,
        maxAdditionalDistanceKm: 1,
      });

      expect(result.cheapest.additionalDistanceKm).toBeLessThanOrEqual(1);
      // The cheap shops are further out, so this is the convenient one.
      expect(result.cheapest.stores[0].storeName).toBe('Carrefour Centro');
    });

    it('will not add a stop that does not save enough', async () => {
      const { result } = await optimize(listId, {
        maxStores: 3,
        minSavingsCentsPerExtraStore: 100_000,
      });

      expect(result.cheapest.stores).toHaveLength(1);
    });

    it('applies the default savings threshold when none is given', async () => {
      // Splitting this list saves 300, under the default 400 an extra shop
      // must earn, so the recommendation stays at one store.
      const accepted = await http()
        .post(`/v1/shopping-lists/${listId}/optimize`)
        .set(auth(shopper))
        .send({
          ...HOME,
          radiusKm: 20,
          maxStores: 3,
          maxAdditionalDistanceKm: 50,
          maxAdditionalMinutes: 240,
        });

      expect([200, 202]).toContain(accepted.status);

      const deadline = Date.now() + 15_000;
      let current = accepted.body;

      while (Date.now() < deadline && current.status !== 'COMPLETED') {
        current = (
          await http()
            .get(`/v1/optimizations/${accepted.body.id}`)
            .set(auth(shopper))
            .expect(200)
        ).body;
      }

      expect(current.result.cheapest.stores).toHaveLength(1);
      expect(
        current.result.rejectedCheaperAlternatives.some(
          (rejected: { violations: string[] }) =>
            rejected.violations.includes('EXTRA_STORE_NOT_WORTH_IT'),
        ),
      ).toBe(true);
    });

    it('keeps an excluded chain out of the answer', async () => {
      const chains = await http()
        .get('/v1/supermarkets')
        .set(auth(shopper))
        .expect(200);

      const dia = chains.body.find(
        (chain: { name: string }) => chain.name === 'Día',
      );

      const { result } = await optimize(listId, {
        maxStores: 3,
        excludedSupermarketIds: [dia.id],
      });

      const named = [result.cheapest, result.bestBalance, result.simplest]
        .flatMap((plan) => plan.stores)
        .map((store: { supermarketName: string }) => store.supermarketName);

      expect(named).not.toContain('Día');
    });
  });

  describe('preferences', () => {
    it('reads as defaults before anything is chosen', async () => {
      const response = await http()
        .get('/v1/optimization-preferences')
        .set(auth(intruder))
        .expect(200);

      expect(response.body).toMatchObject({
        maxStores: 2,
        maxAdditionalDistanceKm: 5,
        mode: 'BEST_BALANCE',
      });
    });

    it('is remembered and applied to later optimizations', async () => {
      await http()
        .patch('/v1/optimization-preferences')
        .set(auth(shopper))
        .send({ maxStores: 1, mode: 'CHEAPEST' })
        .expect(200);

      const listId = await createList([
        { productId: milkId, quantity: 1 },
        { productId: breadId, quantity: 1 },
      ]);

      const { result, mode } = await optimize(listId);

      expect(mode).toBe('CHEAPEST');
      expect(result.cheapest.stores).toHaveLength(1);
    });

    it('refuses a supermarket that is both preferred and excluded', async () => {
      await http()
        .patch('/v1/optimization-preferences')
        .set(auth(shopper))
        .send({
          preferredSupermarketIds: [nearStore],
          excludedSupermarketIds: [nearStore],
        })
        .expect(400);
    });

    it('refuses more stores than anyone would visit', async () => {
      await http()
        .patch('/v1/optimization-preferences')
        .set(auth(shopper))
        .send({ maxStores: 25 })
        .expect(400);
    });
  });

  describe('ownership', () => {
    it('keeps another user out of an optimization and its list', async () => {
      const listId = await createList([{ productId: milkId, quantity: 1 }]);
      const { id } = await optimize(listId, { maxStores: 2 });

      await http().get(`/v1/optimizations/${id}`).set(auth(intruder)).expect(403);
      await http()
        .post(`/v1/shopping-lists/${listId}/optimize`)
        .set(auth(intruder))
        .send(HOME)
        .expect(403);
    });

    it('lists only my own optimizations', async () => {
      const mine = await http()
        .get('/v1/optimizations?pageSize=100')
        .set(auth(shopper))
        .expect(200);
      const theirs = await http()
        .get('/v1/optimizations?pageSize=100')
        .set(auth(intruder))
        .expect(200);

      expect(mine.body.meta.totalItems).toBeGreaterThan(0);
      expect(theirs.body.meta.totalItems).toBe(0);
    });

    it('requires authentication', async () => {
      await http().get('/v1/optimizations').expect(401);
    });
  });

  it('refuses to optimize an empty list', async () => {
    const empty = await http()
      .post('/v1/shopping-lists')
      .set(auth(shopper))
      .send({ name: 'Empty', currency: 'ARS' })
      .expect(201);

    await http()
      .post(`/v1/shopping-lists/${empty.body.id}/optimize`)
      .set(auth(shopper))
      .send(HOME)
      .expect(409);
  });
});
