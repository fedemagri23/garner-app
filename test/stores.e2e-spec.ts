import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  createTestApp,
  registerWithRole,
  resetDatabase,
  uniqueEmail,
} from './helpers/test-app.js';

const OBELISCO = { latitude: -34.6037, longitude: -58.3816 };

describe('Supermarkets and stores (e2e)', () => {
  let app: INestApplication<App>;
  let curator: string;
  let shopper: string;
  let chainId: string;
  let nearStoreId: string;
  let midStoreId: string;
  let farStoreId: string;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = (await createTestApp()) as INestApplication<App>;
    await resetDatabase(app);

    curator = (await registerWithRole(app, 'ADMIN')).accessToken;

    const registration = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: uniqueEmail('store-shopper'),
        password: 'correct-horse-battery',
        displayName: 'Shopper',
      })
      .expect(201);
    shopper = registration.body.accessToken;

    const chain = await request(app.getHttpServer())
      .post('/v1/supermarkets')
      .set(auth(curator))
      .send({ name: 'Coto', websiteUrl: 'https://coto.example' })
      .expect(201);
    chainId = chain.body.id;

    const near = await request(app.getHttpServer())
      .post('/v1/stores')
      .set(auth(curator))
      .send({
        supermarketId: chainId,
        name: 'Coto Centro',
        addressLine: 'Av. Corrientes 1000',
        city: 'Buenos Aires',
        country: 'AR',
        latitude: -34.6047,
        longitude: -58.3826,
        openingHours: [
          { dayOfWeek: 1, opensAt: '09:00', closesAt: '21:00' },
          { dayOfWeek: 2, opensAt: '09:00', closesAt: '21:00' },
        ],
      })
      .expect(201);
    nearStoreId = near.body.id;

    const mid = await request(app.getHttpServer())
      .post('/v1/stores')
      .set(auth(curator))
      .send({
        supermarketId: chainId,
        name: 'Coto Avellaneda',
        addressLine: 'Av. Mitre 500',
        city: 'Avellaneda',
        country: 'AR',
        latitude: -34.6614,
        longitude: -58.3656,
      })
      .expect(201);
    midStoreId = mid.body.id;

    const far = await request(app.getHttpServer())
      .post('/v1/stores')
      .set(auth(curator))
      .send({
        supermarketId: chainId,
        name: 'Coto La Plata',
        addressLine: 'Calle 7 1000',
        city: 'La Plata',
        country: 'AR',
        latitude: -34.9215,
        longitude: -57.9545,
      })
      .expect(201);
    farStoreId = far.body.id;
  });

  afterAll(async () => {
    await resetDatabase(app);
    await app.close();
  });

  describe('chains', () => {
    it('lists the chains in the catalog with a derived slug', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/supermarkets')
        .set(auth(shopper))
        .expect(200);

      expect(response.body).toEqual([
        expect.objectContaining({ name: 'Coto', slug: 'coto' }),
      ]);
    });

    it('rejects a duplicate chain name', async () => {
      await request(app.getHttpServer())
        .post('/v1/supermarkets')
        .set(auth(curator))
        .send({ name: 'Coto' })
        .expect(409);
    });

    it('refuses a chain write from an ordinary shopper', async () => {
      await request(app.getHttpServer())
        .post('/v1/supermarkets')
        .set(auth(shopper))
        .send({ name: 'Rogue Chain' })
        .expect(403);
    });
  });

  describe('stores', () => {
    it('returns a store with its opening hours and chain', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/stores/${nearStoreId}`)
        .set(auth(shopper))
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'Coto Centro',
        supermarketId: chainId,
        supermarketName: 'Coto',
        city: 'Buenos Aires',
      });
      expect(response.body.openingHours).toHaveLength(2);
    });

    it('filters the store list by city', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/stores?city=la%20plata')
        .set(auth(shopper))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(farStoreId);
    });

    it('rejects a store on a chain that does not exist', async () => {
      await request(app.getHttpServer())
        .post('/v1/stores')
        .set(auth(curator))
        .send({
          supermarketId: '00000000-0000-4000-8000-000000000000',
          name: 'Orphan',
          addressLine: 'Nowhere 1',
          city: 'Nowhere',
          country: 'AR',
          latitude: 0,
          longitude: 0,
        })
        .expect(404);
    });

    it('rejects coordinates outside the world', async () => {
      await request(app.getHttpServer())
        .post('/v1/stores')
        .set(auth(curator))
        .send({
          supermarketId: chainId,
          name: 'Impossible',
          addressLine: 'Nowhere 1',
          city: 'Nowhere',
          country: 'AR',
          latitude: 120,
          longitude: -58.38,
        })
        .expect(400);
    });

    it('rejects opening hours that are not wall-clock times', async () => {
      await request(app.getHttpServer())
        .post('/v1/stores')
        .set(auth(curator))
        .send({
          supermarketId: chainId,
          name: 'Bad Hours',
          addressLine: 'Nowhere 1',
          city: 'Nowhere',
          country: 'AR',
          latitude: -34.6,
          longitude: -58.38,
          openingHours: [{ dayOfWeek: 1, opensAt: '9am', closesAt: '21:00' }],
        })
        .expect(400);
    });
  });

  describe('proximity search', () => {
    const nearby = (radiusKm: number) =>
      request(app.getHttpServer())
        .get(
          `/v1/stores/nearby?latitude=${OBELISCO.latitude}` +
            `&longitude=${OBELISCO.longitude}&radiusKm=${radiusKm}`,
        )
        .set(auth(shopper));

    it('returns only stores inside the radius', async () => {
      const response = await nearby(5).expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(nearStoreId);
      expect(response.body[0].distanceKm).toBeLessThan(1);
    });

    it('reaches a further store once the radius is widened, nearest first', async () => {
      const response = await nearby(20).expect(200);

      expect(response.body.map((store: { id: string }) => store.id)).toEqual([
        nearStoreId,
        midStoreId,
      ]);
      expect(response.body[1].distanceKm).toBeGreaterThan(
        response.body[0].distanceKm,
      );
    });

    it('never reaches a store beyond the widest allowed radius', async () => {
      // La Plata is ~53 km away, past the 50 km cap on what "nearby" may mean.
      const response = await nearby(50).expect(200);

      expect(
        response.body.map((store: { id: string }) => store.id),
      ).not.toContain(farStoreId);
    });

    it('reports whether each store is open right now', async () => {
      const response = await nearby(20).expect(200);

      // The Avellaneda store has no hours on record, so it can only read as closed.
      const mid = response.body.find(
        (store: { id: string }) => store.id === midStoreId,
      );
      expect(mid.isOpenNow).toBe(false);
      expect(typeof response.body[0].isOpenNow).toBe('boolean');
    });

    it('rejects a radius beyond what "nearby" can mean', async () => {
      await request(app.getHttpServer())
        .get('/v1/stores/nearby?latitude=-34.6&longitude=-58.38&radiusKm=5000')
        .set(auth(shopper))
        .expect(400);
    });

    it('requires a coordinate to search from', async () => {
      await request(app.getHttpServer())
        .get('/v1/stores/nearby?radiusKm=5')
        .set(auth(shopper))
        .expect(400);
    });
  });
});
