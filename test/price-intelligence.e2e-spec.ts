import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { IntelligencePrismaService } from '../src/common/database/intelligence-prisma.service.js';
import { PricingPrismaService } from '../src/common/database/pricing-prisma.service.js';
import { AggregateDailyPricesUseCase } from '../src/price-intelligence/application/aggregate-daily-prices.use-case.js';
import { RecomputeDerivedPriceUseCase } from '../src/price-intelligence/application/recompute-derived-price.use-case.js';
import {
  createTestApp,
  registerWithRole,
  resetDatabase,
  uniqueEmail,
} from './helpers/test-app.js';

const DAY = 24 * 60 * 60 * 1000;

describe('Price intelligence (e2e)', () => {
  let app: INestApplication<App>;
  let pricing: PricingPrismaService;
  let intelligence: IntelligencePrismaService;
  let recompute: RecomputeDerivedPriceUseCase;
  let aggregate: AggregateDailyPricesUseCase;

  let shopper: string;
  let curator: string;
  let categoryId: string;
  let nearStoreId: string;
  let farStoreId: string;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  /** Writes an observation straight into pricing_db, as ingestion would have. */
  const observe = async (input: {
    productId: string;
    storeId: string;
    priceCents: number;
    daysAgo?: number;
    sourceType?: 'USER_REPORTED' | 'USER_WITH_EVIDENCE' | 'PURCHASE_CONFIRMED' | 'EXTERNAL_API';
    status?: 'ACCEPTED' | 'FLAGGED' | 'REJECTED';
    userId?: string;
  }) => {
    const observedAt = new Date(Date.now() - (input.daysAgo ?? 0) * DAY);

    await pricing.priceObservation.create({
      data: {
        productId: input.productId,
        storeId: input.storeId,
        priceCents: input.priceCents,
        currency: 'ARS',
        observedAt,
        receivedAt: observedAt,
        sourceType: input.sourceType ?? 'USER_REPORTED',
        status: input.status ?? 'ACCEPTED',
        userId: input.userId ?? randomUUID(),
      },
    });
  };

  const newProduct = async (name: string): Promise<string> =>
    (
      await http()
        .post('/v1/products')
        .set(auth(curator))
        .send({ name, categoryId, unit: 'UNIT' })
        .expect(201)
    ).body.id;

  beforeAll(async () => {
    app = (await createTestApp()) as INestApplication<App>;
    await resetDatabase(app);

    pricing = app.get(PricingPrismaService);
    intelligence = app.get(IntelligencePrismaService);
    recompute = app.get(RecomputeDerivedPriceUseCase);
    aggregate = app.get(AggregateDailyPricesUseCase);

    shopper = (
      await http()
        .post('/v1/auth/register')
        .send({
          email: uniqueEmail('prices'),
          password: 'correct-horse-battery',
          displayName: 'Shopper',
        })
        .expect(201)
    ).body.accessToken;

    curator = (await registerWithRole(app, 'ADMIN')).accessToken;

    categoryId = (
      await http()
        .post('/v1/categories')
        .set(auth(curator))
        .send({ name: 'Almacén' })
        .expect(201)
    ).body.id;

    const chain = await http()
      .post('/v1/supermarkets')
      .set(auth(curator))
      .send({ name: 'Disco' })
      .expect(201);

    const store = async (name: string, latitude: number, longitude: number) =>
      (
        await http()
          .post('/v1/stores')
          .set(auth(curator))
          .send({
            supermarketId: chain.body.id,
            name,
            addressLine: 'Av. Siempre Viva 100',
            city: 'Buenos Aires',
            country: 'AR',
            latitude,
            longitude,
            openingHours: [{ dayOfWeek: 1, opensAt: '09:00', closesAt: '21:00' }],
          })
          .expect(201)
      ).body.id as string;

    nearStoreId = await store('Disco Centro', -34.6047, -58.3826);
    farStoreId = await store('Disco La Plata', -34.9215, -57.9545);
  });

  afterAll(async () => {
    await resetDatabase(app);
    await app.close();
  });

  describe('deriving a current price', () => {
    it('derives a price from recent observations rather than the newest one', async () => {
      const productId = await newProduct('Fideos 500g');

      for (const priceCents of [500, 510, 495]) {
        await observe({ productId, storeId: nearStoreId, priceCents });
      }
      await observe({ productId, storeId: nearStoreId, priceCents: 900 });

      await recompute.execute(productId, nearStoreId);

      const derived = await intelligence.derivedPrice.findUnique({
        where: { productId_storeId: { productId, storeId: nearStoreId } },
      });

      expect(derived!.observationCount).toBe(4);
      // The 900 counts, but does not become the price.
      expect(derived!.priceCents).toBeGreaterThan(500);
      expect(derived!.priceCents).toBeLessThan(700);
    });

    it('leans on a confirmed purchase over a typed report', async () => {
      const productId = await newProduct('Arroz 1kg');

      await observe({ productId, storeId: nearStoreId, priceCents: 400, sourceType: 'PURCHASE_CONFIRMED' });
      await observe({ productId, storeId: nearStoreId, priceCents: 600, sourceType: 'USER_REPORTED' });

      await recompute.execute(productId, nearStoreId);

      const derived = await intelligence.derivedPrice.findUnique({
        where: { productId_storeId: { productId, storeId: nearStoreId } },
      });

      expect(derived!.priceCents).toBeLessThan(500);
    });

    it('keeps quarantined observations out of the price', async () => {
      const productId = await newProduct('Azúcar 1kg');

      await observe({ productId, storeId: nearStoreId, priceCents: 300 });
      await observe({ productId, storeId: nearStoreId, priceCents: 30_000, status: 'REJECTED' });
      await observe({ productId, storeId: nearStoreId, priceCents: 20_000, status: 'FLAGGED' });

      await recompute.execute(productId, nearStoreId);

      const derived = await intelligence.derivedPrice.findUnique({
        where: { productId_storeId: { productId, storeId: nearStoreId } },
      });

      expect(derived).toMatchObject({ priceCents: 300, observationCount: 1 });
    });

    it('rebuilds itself from observations after the derived table is wiped', async () => {
      const productId = await newProduct('Yerba 500g');
      await observe({ productId, storeId: nearStoreId, priceCents: 700 });
      await recompute.execute(productId, nearStoreId);

      await intelligence.derivedPrice.deleteMany({ where: { productId } });
      await recompute.execute(productId, nearStoreId);

      expect(
        await intelligence.derivedPrice.findUnique({
          where: { productId_storeId: { productId, storeId: nearStoreId } },
        }),
      ).toMatchObject({ priceCents: 700 });
    });

    it('drops a price once every observation behind it has aged out', async () => {
      const productId = await newProduct('Galletas 300g');
      await observe({ productId, storeId: nearStoreId, priceCents: 250 });
      await recompute.execute(productId, nearStoreId);

      await pricing.priceObservation.deleteMany({ where: { productId } });
      await recompute.execute(productId, nearStoreId);

      expect(await intelligence.derivedPrice.count({ where: { productId } })).toBe(0);
    });
  });

  describe('comparing prices', () => {
    let productId: string;

    beforeAll(async () => {
      productId = await newProduct('Leche Entera 1L');

      await observe({ productId, storeId: nearStoreId, priceCents: 300 });
      await observe({ productId, storeId: farStoreId, priceCents: 250 });

      await recompute.execute(productId, nearStoreId);
      await recompute.execute(productId, farStoreId);
    });

    it('lists stores cheapest first, with confidence and context', async () => {
      const response = await http()
        .get(`/v1/products/${productId}/prices`)
        .set(auth(shopper))
        .expect(200);

      expect(response.body.productName).toBe('Leche Entera 1L');
      expect(response.body.prices.map((price: { priceCents: number }) => price.priceCents)).toEqual([
        250, 300,
      ]);
      expect(response.body.lowestPriceCents).toBe(250);
      expect(response.body.prices[0]).toMatchObject({
        supermarketName: 'Disco',
        confidence: expect.any(String),
        observationCount: 1,
        distanceKm: null,
      });
    });

    it('limits to stores near a location, with distances', async () => {
      const response = await http()
        .get(`/v1/products/${productId}/prices?latitude=-34.6037&longitude=-58.3816&radiusKm=5`)
        .set(auth(shopper))
        .expect(200);

      expect(response.body.prices).toHaveLength(1);
      expect(response.body.prices[0]).toMatchObject({ storeId: nearStoreId });
      expect(response.body.prices[0].distanceKm).toBeLessThan(1);
    });

    it('refuses half a coordinate rather than quietly widening the search', async () => {
      await http()
        .get(`/v1/products/${productId}/prices?latitude=-34.6037`)
        .set(auth(shopper))
        .expect(400);
    });

    it('serves a repeat read from cache, and shows a new price immediately', async () => {
      const url = `/v1/products/${productId}/prices`;

      const first = await http().get(url).set(auth(shopper)).expect(200);
      const cached = await http().get(url).set(auth(shopper)).expect(200);
      expect(cached.body).toEqual(first.body);

      await observe({ productId, storeId: nearStoreId, priceCents: 200 });
      await observe({ productId, storeId: nearStoreId, priceCents: 205 });
      await recompute.execute(productId, nearStoreId);

      const afterChange = await http().get(url).set(auth(shopper)).expect(200);
      expect(afterChange.body.lowestPriceCents).toBeLessThan(
        first.body.lowestPriceCents,
      );
    });

    it('needs authentication and a real product', async () => {
      await http().get(`/v1/products/${productId}/prices`).expect(401);
      await http()
        .get(`/v1/products/${randomUUID()}/prices`)
        .set(auth(shopper))
        .expect(404);
    });
  });

  describe('daily history', () => {
    let productId: string;

    const aggregateDaysAgo = (days: number) =>
      aggregate.execute(new Date(Date.now() - days * DAY));

    beforeAll(async () => {
      productId = await newProduct('Café Molido 250g');

      await observe({ productId, storeId: nearStoreId, priceCents: 1000, daysAgo: 3 });
      await observe({ productId, storeId: nearStoreId, priceCents: 1040, daysAgo: 3 });
      await observe({ productId, storeId: nearStoreId, priceCents: 900, daysAgo: 2 });
      await observe({ productId, storeId: nearStoreId, priceCents: 3000, daysAgo: 1 });

      for (const days of [3, 2, 1]) {
        await aggregateDaysAgo(days);
      }
    });

    it('compresses each day into one row per store', async () => {
      const rows = await intelligence.dailyPriceHistory.findMany({
        where: { productId },
        orderBy: { date: 'asc' },
      });

      expect(rows).toHaveLength(3);
      expect(rows[0]).toMatchObject({
        observationCount: 2,
        minPriceCents: 1000,
        maxPriceCents: 1040,
      });
    });

    it('marks the day that jumped, and keeps it out of the summary', async () => {
      const response = await http()
        .get(`/v1/products/${productId}/prices/history?range=30d&storeId=${nearStoreId}`)
        .set(auth(shopper))
        .expect(200);

      expect(response.body.points).toHaveLength(3);
      expect(response.body.points.filter((point: { isAnomalous: boolean }) => point.isAnomalous))
        .toHaveLength(1);

      // The 3000 day is visible in the series but does not set the average.
      expect(response.body.trend.averageCents).toBeLessThan(1100);
      expect(response.body.trend.lowestCents).toBe(900);
    });

    it('re-running a day rewrites its row rather than adding one', async () => {
      const before = await intelligence.dailyPriceHistory.findMany({ where: { productId } });

      await aggregateDaysAgo(3);
      await aggregateDaysAgo(3);

      const after = await intelligence.dailyPriceHistory.findMany({ where: { productId } });
      expect(after).toHaveLength(before.length);
      expect(after.map((row) => row.weightedAverageCents).sort()).toEqual(
        before.map((row) => row.weightedAverageCents).sort(),
      );
    });

    it('serves history from daily aggregates after the raw observations are gone', async () => {
      await pricing.priceObservation.deleteMany({ where: { productId } });

      const response = await http()
        .get(`/v1/products/${productId}/prices/history?range=90d&storeId=${nearStoreId}`)
        .set(auth(shopper))
        .expect(200);

      expect(response.body.points).toHaveLength(3);
      expect(response.body.trend).not.toBeNull();
    });

    it('covers every store when no store is named', async () => {
      const response = await http()
        .get(`/v1/products/${productId}/prices/history?range=30d`)
        .set(auth(shopper))
        .expect(200);

      expect(response.body.storeId).toBeNull();
      expect(response.body.currentPriceCents).toBeNull();
      expect(response.body.points.length).toBeGreaterThan(0);
    });

    it('rejects a range it does not offer', async () => {
      await http()
        .get(`/v1/products/${productId}/prices/history?range=7d`)
        .set(auth(shopper))
        .expect(400);
    });
  });

  describe('the pipeline end to end', () => {
    it('turns a reported price into a shown price', async () => {
      const productId = await newProduct('Manteca 200g');

      await http()
        .post('/v1/price-observations')
        .set(auth(shopper))
        .send({ productId, storeId: nearStoreId, priceCents: 850, currency: 'ARS' })
        .expect(201);

      // The report came from a new account, so it is held for review and
      // cannot yet shape the price.
      await recompute.execute(productId, nearStoreId);
      expect(await intelligence.derivedPrice.count({ where: { productId } })).toBe(0);

      // Two other shoppers see much the same price.
      await observe({ productId, storeId: nearStoreId, priceCents: 860, userId: randomUUID() });
      await observe({ productId, storeId: nearStoreId, priceCents: 840, userId: randomUUID() });
      await recompute.execute(productId, nearStoreId);

      const response = await http()
        .get(`/v1/products/${productId}/prices`)
        .set(auth(shopper))
        .expect(200);

      // Corroborated, so the held-back report now counts — all three do.
      expect(response.body.prices[0].observationCount).toBe(3);
      expect(response.body.prices[0].priceCents).toBeGreaterThan(830);
      expect(response.body.prices[0].priceCents).toBeLessThan(870);
    });
  });
});
