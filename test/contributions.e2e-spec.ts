import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ReconcileSessionContributionsUseCase } from '../src/contributions/application/reconcile-session-contributions.use-case.js';
import { CorePrismaService } from '../src/common/database/core-prisma.service.js';
import { PricingPrismaService } from '../src/common/database/pricing-prisma.service.js';
import {
  createTestApp,
  registerWithRole,
  resetDatabase,
  uniqueEmail,
} from './helpers/test-app.js';

const DAY = 24 * 60 * 60 * 1000;

/** The smallest byte sequence the evidence store recognizes as a PNG. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);

async function waitFor<T>(
  probe: () => Promise<T | null | undefined>,
  timeoutMs = 10_000,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await probe();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return null;
}

describe('Price contributions (e2e)', () => {
  let app: INestApplication<App>;
  let pricing: PricingPrismaService;
  let core: CorePrismaService;

  let established: string;
  let newcomer: string;
  let categoryId: string;
  let productId: string;
  let retiredId: string;
  let storeId: string;
  let otherStoreId: string;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  const register = async (prefix: string, ageMs = 0): Promise<string> => {
    const email = uniqueEmail(prefix);
    const response = await http()
      .post('/v1/auth/register')
      .send({ email, password: 'correct-horse-battery', displayName: 'Shopper' })
      .expect(201);

    if (ageMs > 0) {
      await core.user.update({
        where: { email },
        data: { createdAt: new Date(Date.now() - ageMs) },
      });
    }

    return response.body.accessToken;
  };

  const report = (token: string, body: Record<string, unknown>) =>
    http()
      .post('/v1/price-observations')
      .set(auth(token))
      .send({ productId, storeId, currency: 'ARS', ...body });

  /** A fresh product, so deviation history from one test does not leak into another. */
  const newProduct = async (name: string, curator: string): Promise<string> =>
    (
      await http()
        .post('/v1/products')
        .set(auth(curator))
        .send({ name, categoryId, unit: 'UNIT' })
        .expect(201)
    ).body.id;

  let curator: string;

  beforeAll(async () => {
    app = (await createTestApp()) as INestApplication<App>;
    await resetDatabase(app);
    pricing = app.get(PricingPrismaService);
    core = app.get(CorePrismaService);

    established = await register('established', 60 * DAY);
    newcomer = await register('newcomer');
    curator = (await registerWithRole(app, 'ADMIN')).accessToken;

    categoryId = (
      await http()
        .post('/v1/categories')
        .set(auth(curator))
        .send({ name: 'Bebidas' })
        .expect(201)
    ).body.id;

    productId = await newProduct('Agua Mineral 2L', curator);
    retiredId = await newProduct('Gaseosa Discontinuada', curator);
    await http()
      .patch(`/v1/products/${retiredId}`)
      .set(auth(curator))
      .send({ isActive: false })
      .expect(200);

    const chain = await http()
      .post('/v1/supermarkets')
      .set(auth(curator))
      .send({ name: 'Jumbo' })
      .expect(201);

    const store = async (name: string) =>
      (
        await http()
          .post('/v1/stores')
          .set(auth(curator))
          .send({
            supermarketId: chain.body.id,
            name,
            addressLine: 'Av. Cabildo 1000',
            city: 'Buenos Aires',
            country: 'AR',
            latitude: -34.56,
            longitude: -58.45,
          })
          .expect(201)
      ).body.id as string;

    storeId = await store('Jumbo Belgrano');
    otherStoreId = await store('Jumbo Palermo');
  });

  afterAll(async () => {
    await resetDatabase(app);
    await app.close();
  });

  describe('explicit price reports', () => {
    it('accepts a report from an established account, stored only in pricing_db', async () => {
      const response = await report(established, { priceCents: 450 }).expect(201);

      expect(response.body).toMatchObject({
        productId,
        storeId,
        priceCents: 450,
        currency: 'ARS',
        sourceType: 'USER_REPORTED',
        status: 'ACCEPTED',
        hasPhotoEvidence: false,
      });

      const row = await pricing.priceObservation.findUnique({
        where: { id: response.body.id },
      });
      expect(row).toMatchObject({ sourceType: 'USER_REPORTED', status: 'ACCEPTED' });
    });

    it('holds a brand-new account’s report for review without saying why', async () => {
      const response = await report(newcomer, { priceCents: 455 }).expect(201);

      expect(response.body.status).toBe('UNDER_REVIEW');
      expect(JSON.stringify(response.body)).not.toMatch(/NEW_ACCOUNT|reason/i);

      const row = await pricing.priceObservation.findUnique({
        where: { id: response.body.id },
      });
      expect(row).toMatchObject({ status: 'FLAGGED', reviewReasons: ['NEW_ACCOUNT'] });
    });

    it('stores one observation when a report is retried with the same id', async () => {
      const id = randomUUID();

      const first = await report(established, { id, priceCents: 460, storeId: otherStoreId }).expect(201);
      const retry = await report(established, { id, priceCents: 460, storeId: otherStoreId }).expect(201);

      expect(retry.body.id).toBe(first.body.id);
      expect(await pricing.priceObservation.count({ where: { id } })).toBe(1);
    });

    it('treats an identical report sent twice in quick succession as one', async () => {
      const product = await newProduct('Soda 1.5L', curator);

      const first = await report(established, { productId: product, priceCents: 300 }).expect(201);
      const second = await report(established, { productId: product, priceCents: 300 }).expect(201);

      expect(second.body.id).toBe(first.body.id);
      expect(await pricing.priceObservation.count({ where: { productId: product } })).toBe(1);
    });

    it('refuses what cannot be a price, and stores nothing', async () => {
      const before = await pricing.priceObservation.count();

      await report(established, { priceCents: 0 }).expect(400);
      await report(established, { priceCents: 1.5 }).expect(400);
      await report(established, { priceCents: 450, currency: 'pesos' }).expect(400);
      await report(established, {
        priceCents: 450,
        observedAt: new Date(Date.now() + DAY).toISOString(),
      }).expect(400);
      await report(established, {
        priceCents: 450,
        observedAt: new Date(Date.now() - 30 * DAY).toISOString(),
      }).expect(400);

      expect(await pricing.priceObservation.count()).toBe(before);
    });

    it('refuses an unknown product or store, and a retired product', async () => {
      await report(established, { priceCents: 450, productId: randomUUID() }).expect(404);
      await report(established, { priceCents: 450, storeId: randomUUID() }).expect(404);
      await report(established, { priceCents: 450, productId: retiredId }).expect(422);
    });

    it('rejects an extreme price against recent history, and keeps it for review', async () => {
      const product = await newProduct('Jugo 1L', curator);

      for (const priceCents of [500, 510, 490]) {
        await pricing.priceObservation.create({
          data: {
            productId: product,
            storeId,
            priceCents,
            currency: 'ARS',
            observedAt: new Date(Date.now() - DAY),
            sourceType: 'EXTERNAL_API',
            status: 'ACCEPTED',
          },
        });
      }

      const typo = await report(established, { productId: product, priceCents: 50_000 }).expect(201);
      expect(typo.body.status).toBe('REJECTED');

      const reasonable = await report(established, { productId: product, priceCents: 520 }).expect(201);
      expect(reasonable.body.status).toBe('ACCEPTED');
    });

    it('limits how often one person reports the same product at the same store', async () => {
      const product = await newProduct('Cerveza 1L', curator);
      const statuses: number[] = [];
      const reviewed: string[] = [];

      // Different prices each time, so none is collapsed as a duplicate.
      for (let attempt = 0; attempt < 6; attempt++) {
        const response = await report(established, {
          productId: product,
          priceCents: 800 + attempt,
        });
        statuses.push(response.status);
        if (response.status === 201) {
          reviewed.push(response.body.status);
        }
      }

      expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
      // From the third report on, repeats are held back even before the limit.
      expect(reviewed).toEqual([
        'ACCEPTED',
        'ACCEPTED',
        'UNDER_REVIEW',
        'UNDER_REVIEW',
        'UNDER_REVIEW',
      ]);
      expect(await pricing.priceObservation.count({ where: { productId: product } })).toBe(5);
    });

    it('requires authentication', async () => {
      await http()
        .post('/v1/price-observations')
        .send({ productId, storeId, priceCents: 450, currency: 'ARS' })
        .expect(401);
    });
  });

  describe('evidence', () => {
    const upload = (token: string, content: Buffer, filename = 'shelf.png') =>
      http()
        .post('/v1/price-evidence')
        .set(auth(token))
        .attach('photo', content, filename);

    it('upgrades a report with an uploaded photo to evidence-backed', async () => {
      const uploaded = await upload(established, PNG).expect(201);
      const product = await newProduct('Vino Tinto 750ml', curator);

      const response = await report(established, {
        productId: product,
        priceCents: 2500,
        evidence: { photoKey: uploaded.body.photoKey, note: 'Shelf label, aisle 4' },
      }).expect(201);

      expect(response.body).toMatchObject({
        sourceType: 'USER_WITH_EVIDENCE',
        hasPhotoEvidence: true,
        note: 'Shelf label, aisle 4',
      });
    });

    it('does not let one user claim another user’s photo', async () => {
      const uploaded = await upload(established, PNG).expect(201);

      await report(newcomer, {
        priceCents: 450,
        evidence: { photoKey: uploaded.body.photoKey },
      }).expect(422);
    });

    it('refuses a photo key that names nothing', async () => {
      await report(established, {
        priceCents: 450,
        evidence: { photoKey: '../../etc/passwd' },
      }).expect(422);
    });

    it('keeps a note without a photo as a plain report', async () => {
      const product = await newProduct('Leche Chocolatada 1L', curator);

      const response = await report(established, {
        productId: product,
        priceCents: 900,
        evidence: { note: 'On promotion' },
      }).expect(201);

      expect(response.body.sourceType).toBe('USER_REPORTED');
    });

    it('refuses an upload that is not an image, whatever its name says', async () => {
      await upload(established, Buffer.from('<svg onload="alert(1)"/>'), 'photo.png').expect(422);
    });

    it('refuses a request with no photo', async () => {
      await http().post('/v1/price-evidence').set(auth(established)).expect(422);
    });
  });

  describe('my contributions', () => {
    it('lists only my own contributions, newest first', async () => {
      const mine = await http()
        .get('/v1/price-observations/mine?pageSize=100')
        .set(auth(newcomer))
        .expect(200);

      expect(mine.body.data.length).toBeGreaterThan(0);
      const rows = await pricing.priceObservation.findMany({
        where: { id: { in: mine.body.data.map((row: { id: string }) => row.id) } },
      });
      expect(new Set(rows.map((row) => row.userId)).size).toBe(1);

      const times = mine.body.data.map((row: { receivedAt: string }) => Date.parse(row.receivedAt));
      expect([...times].sort((a, b) => b - a)).toEqual(times);
    });
  });

  describe('shopping-trip contributions', () => {
    /** Runs a real trip: list → start at a store → record prices → complete. */
    const completeTrip = async (token: string) => {
      const product = await newProduct(`Trip Product ${randomUUID()}`, curator);

      const list = await http()
        .post('/v1/shopping-lists')
        .set(auth(token))
        .send({ name: 'Trip', currency: 'ARS' })
        .expect(201);

      for (const expectedUnitPriceCents of [700, 100]) {
        await http()
          .post(`/v1/shopping-lists/${list.body.id}/items`)
          .set(auth(token))
          .send({ productId: product, quantity: 1, expectedUnitPriceCents })
          .expect(201);
      }

      const session = (
        await http()
          .post('/v1/shopping-sessions')
          .set(auth(token))
          .send({ listId: list.body.id, storeId })
          .expect(201)
      ).body;

      const [priced, confirmedOnly] = session.items;

      await http()
        .patch(`/v1/shopping-sessions/${session.id}/items/${priced.id}`)
        .set(auth(token))
        .send({ isPurchased: true, actualUnitPriceCents: 720 })
        .expect(200);

      await http()
        .patch(`/v1/shopping-sessions/${session.id}/items/${confirmedOnly.id}`)
        .set(auth(token))
        .send({ isPurchased: true })
        .expect(200);

      await http()
        .post(`/v1/shopping-sessions/${session.id}/complete`)
        .set(auth(token))
        .expect(200);

      return { sessionId: session.id as string, product };
    };

    it('turns a completed trip’s actual prices into confirmed-purchase observations, with no extra step', async () => {
      const { sessionId, product } = await completeTrip(newcomer);

      const ledger = await waitFor(() =>
        pricing.sessionContribution.findUnique({ where: { sessionId } }),
      );
      expect(ledger).toMatchObject({ observationCount: 1, skippedCount: 1 });

      const observations = await pricing.priceObservation.findMany({
        where: { shoppingSessionId: sessionId },
      });
      expect(observations).toHaveLength(1);
      expect(observations[0]).toMatchObject({
        productId: product,
        storeId,
        priceCents: 720,
        sourceType: 'PURCHASE_CONFIRMED',
        // A real purchase is not held back just because the account is new.
        status: 'ACCEPTED',
      });
    });

    it('recovers the contributions of a trip whose completion event was lost', async () => {
      const { sessionId } = await completeTrip(established);
      await waitFor(() => pricing.sessionContribution.findUnique({ where: { sessionId } }));

      // Simulate the event never having been handled.
      await pricing.priceObservation.deleteMany({ where: { shoppingSessionId: sessionId } });
      await pricing.sessionContribution.delete({ where: { sessionId } });

      const reconcile = app.get(ReconcileSessionContributionsUseCase);
      const queued = await reconcile.execute(new Date(Date.now() + 10 * 60 * 1000));
      expect(queued).toBeGreaterThanOrEqual(1);

      const recovered = await waitFor(() =>
        pricing.sessionContribution.findUnique({ where: { sessionId } }),
      );
      expect(recovered).not.toBeNull();
      expect(
        await pricing.priceObservation.count({ where: { shoppingSessionId: sessionId } }),
      ).toBe(1);
    });

    it('does not duplicate observations when a trip is processed again', async () => {
      const { sessionId } = await completeTrip(established);
      await waitFor(() => pricing.sessionContribution.findUnique({ where: { sessionId } }));

      // Drop only the ledger entry, forcing a full re-run over existing rows.
      await pricing.sessionContribution.delete({ where: { sessionId } });
      await app
        .get(ReconcileSessionContributionsUseCase)
        .execute(new Date(Date.now() + 10 * 60 * 1000));

      await waitFor(() => pricing.sessionContribution.findUnique({ where: { sessionId } }));
      expect(
        await pricing.priceObservation.count({ where: { shoppingSessionId: sessionId } }),
      ).toBe(1);
    });
  });
});
