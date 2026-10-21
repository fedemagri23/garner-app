import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { CorePrismaService } from '../src/common/database/core-prisma.service.js';
import { PriceAcceptedListener } from '../src/community/application/price-accepted.listener.js';
import {
  createTestApp,
  registerWithRole,
  resetDatabase,
  uniqueEmail,
} from './helpers/test-app.js';

const DAY = 24 * 60 * 60 * 1000;
const OBELISCO = { latitude: -34.6037, longitude: -58.3816 };

describe('Shopper-added products and shops (e2e)', () => {
  let app: INestApplication<App>;
  let core: CorePrismaService;
  let admin: string;
  let categoryId: string;
  let chainId: string;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  /** A shopper; `ageDays` back-dates the account, `trusted` gives it a clean record. */
  const shopper = async (ageDays = 30, trusted = false): Promise<{ token: string; id: string }> => {
    const email = uniqueEmail('community');
    const registered = await http()
      .post('/v1/auth/register')
      .send({ email, password: 'correct-horse-battery', displayName: 'Shopper' })
      .expect(201);
    const user = await core.user.update({
      where: { email },
      data: { createdAt: new Date(Date.now() - ageDays * DAY) },
    });
    if (trusted) {
      // Accepted prices: eight products at the team's shop.
      const products = await core.product.findMany({ where: { origin: 'VERIFIED' }, take: 8 });
      const store = await core.storeLocation.findFirstOrThrow({ where: { origin: 'VERIFIED' } });
      await core.storePriceContributor.createMany({
        data: products.map((product) => ({ storeLocationId: store.id, productId: product.id, userId: user.id })),
      });
    }
    return { token: registered.body.accessToken, id: user.id };
  };

  const addProduct = (token: string, body: Record<string, unknown> = {}) =>
    http()
      .post('/v1/products')
      .set(auth(token))
      .send({ name: 'Yerba Mate Suave 500g', categoryId, unit: 'GRAM', packageSize: 500, ...body });

  const addStore = (token: string, body: Record<string, unknown> = {}) =>
    http()
      .post('/v1/stores')
      .set(auth(token))
      .send({
        supermarketId: chainId,
        name: 'Chino de la esquina',
        addressLine: 'Av. Corrientes 1000',
        city: 'Buenos Aires',
        country: 'AR',
        ...OBELISCO,
        ...body,
      });

  const nearby = (token: string) =>
    http()
      .get('/v1/stores/nearby')
      .query({ ...OBELISCO, radiusKm: 2, limit: 20 })
      .set(auth(token))
      .expect(200);

  beforeAll(async () => {
    app = (await createTestApp()) as INestApplication<App>;
    await resetDatabase(app);
    core = app.get(CorePrismaService);
    admin = (await registerWithRole(app, 'ADMIN')).accessToken;

    categoryId = (await http().post('/v1/categories').set(auth(admin)).send({ name: 'Almacén' }).expect(201)).body.id;
    chainId = (await http().post('/v1/supermarkets').set(auth(admin)).send({ name: 'Coto' }).expect(201)).body.id;
    await http()
      .post('/v1/stores')
      .set(auth(admin))
      .send({
        supermarketId: chainId,
        name: 'Coto Centro',
        addressLine: 'Viamonte 1500',
        city: 'Buenos Aires',
        country: 'AR',
        latitude: -34.6,
        longitude: -58.39,
      })
      .expect(201);
    for (let i = 0; i < 12; i += 1) {
      await http()
        .post('/v1/products')
        .set(auth(admin))
        .send({ name: `Producto del equipo ${i}`, categoryId, unit: 'UNIT' })
        .expect(201);
    }
  });

  afterAll(async () => {
    await resetDatabase(app);
    await app.close();
  });

  describe('products', () => {
    it('lets a shopper add one, visible to everyone at once and marked COMMUNITY', async () => {
      const ana = await shopper();
      const other = await shopper();

      const created = await addProduct(ana.token, { name: 'Alfajor Artesanal Triple' }).expect(201);
      expect(created.body).toMatchObject({ origin: 'COMMUNITY', confirmationCount: 0 });

      const found = await http().get('/v1/products').query({ search: 'alfajor artesanal' }).set(auth(other.token)).expect(200);
      expect(found.body.data.map((p: { id: string }) => p.id)).toContain(created.body.id);
    });

    it('keeps the team\'s products, and the team\'s pictures, as VERIFIED', async () => {
      const created = await http()
        .post('/v1/products')
        .set(auth(admin))
        .send({ name: 'Arroz Largo Fino 1kg', categoryId, unit: 'KILOGRAM', packageSize: 1, imageUrl: 'https://img.test/arroz.png' })
        .expect(201);
      expect(created.body).toMatchObject({ origin: 'VERIFIED', imageUrl: 'https://img.test/arroz.png' });

      const ana = await shopper();
      const mine = await addProduct(ana.token, { name: 'Arroz Integral', imageUrl: 'https://evil.test/x.png' }).expect(201);
      expect(mine.body.imageUrl).toBeNull();
    });

    it('ranks a team product above a shopper\'s with the same words', async () => {
      const ana = await shopper();
      await addProduct(ana.token, { name: 'Fideos Moño 500g', packageSize: 500 }).expect(201);
      await http()
        .post('/v1/products')
        .set(auth(admin))
        .send({ name: 'Fideos Moño Integrales', categoryId, unit: 'UNIT' })
        .expect(201);

      const found = await http().get('/v1/products').query({ search: 'fideos mono' }).set(auth(ana.token)).expect(200);
      expect(found.body.data.map((p: { origin: string }) => p.origin)).toEqual(['VERIFIED', 'COMMUNITY']);
    });

    it('suggests what is already there, and refuses the same product twice', async () => {
      const ana = await shopper();
      const ben = await shopper();
      await addProduct(ana.token, { name: 'Dulce de Leche Colonial 400g', unit: 'GRAM', packageSize: 400 }).expect(201);

      const suggestions = await http()
        .get('/v1/product-suggestions')
        .query({ name: 'dulce de leche' })
        .set(auth(ben.token))
        .expect(200);
      expect(suggestions.body.map((p: { name: string }) => p.name)).toContain('Dulce de Leche Colonial 400g');

      const twice = await addProduct(ben.token, { name: 'dulce de leche colonial 400g', unit: 'GRAM', packageSize: 400 }).expect(409);
      expect(twice.body.message).toMatch(/already in the catalog/);

      // Another size is another product.
      await addProduct(ben.token, { name: 'Dulce de Leche Colonial 400g', unit: 'GRAM', packageSize: 1000 }).expect(201);
    });

    it('refuses links and markup in a name', async () => {
      const ana = await shopper();
      await addProduct(ana.token, { name: 'Gratis en http://spam.test' }).expect(400);
      await addProduct(ana.token, { name: '<b>Leche</b>' }).expect(400);
    });

    it('lets a brand-new account add only a few a day', async () => {
      const fresh = await shopper(0);
      for (let i = 0; i < 3; i += 1) {
        await addProduct(fresh.token, { name: `Galletitas nuevas ${i}` }).expect(201);
      }
      await addProduct(fresh.token, { name: 'Galletitas nuevas 3' }).expect(429);
    });
  });

  describe('confirmations', () => {
    it('counts each other person once, never the creator, and can be taken back', async () => {
      const ana = await shopper();
      const ben = await shopper();
      const cleo = await shopper();
      const product = (await addProduct(ana.token, { name: 'Pan Lactal Casero' }).expect(201)).body.id;

      await http().post(`/v1/products/${product}/confirmations`).set(auth(ana.token)).expect(403);
      await http().post(`/v1/products/${product}/confirmations`).set(auth(ben.token)).expect(200);
      const twice = await http().post(`/v1/products/${product}/confirmations`).set(auth(ben.token)).expect(200);
      expect(twice.body).toEqual({ confirmations: 1 });
      await http().post(`/v1/products/${product}/confirmations`).set(auth(cleo.token)).expect(200);

      const read = await http().get(`/v1/products/${product}`).set(auth(ana.token)).expect(200);
      expect(read.body.confirmationCount).toBe(2);
      expect((await core.product.findUniqueOrThrow({ where: { id: product } })).weight).toBe(6);

      const back = await http().delete(`/v1/products/${product}/confirmations`).set(auth(cleo.token)).expect(200);
      expect(back.body).toEqual({ confirmations: 1 });
    });

    it('answers 404 for a product that does not exist', async () => {
      const ben = await shopper();
      await http()
        .post('/v1/products/00000000-0000-4000-8000-000000000000/confirmations')
        .set(auth(ben.token))
        .expect(404);
    });
  });

  describe('flags', () => {
    it('pulls a product from search once enough trusted people flag it, and puts it in the queue', async () => {
      const ana = await shopper();
      const product = (await addProduct(ana.token, { name: 'Producto Inventado Trucho' }).expect(201)).body.id;

      await http().post(`/v1/products/${product}/flags`).set(auth(ana.token)).send({ reason: 'NOT_EXIST' }).expect(403);

      // Throwaway accounts barely count.
      for (let i = 0; i < 3; i += 1) {
        const throwaway = await shopper(0);
        await http().post(`/v1/products/${product}/flags`).set(auth(throwaway.token)).send({ reason: 'NOT_EXIST' }).expect(204);
      }
      let found = await http().get('/v1/products').query({ search: 'inventado trucho' }).set(auth(ana.token)).expect(200);
      expect(found.body.data).toHaveLength(1);

      for (let i = 0; i < 4; i += 1) {
        const trusted = await shopper(90, true);
        await http().post(`/v1/products/${product}/flags`).set(auth(trusted.token)).send({ reason: 'NOT_EXIST' }).expect(204);
      }
      found = await http().get('/v1/products').query({ search: 'inventado trucho' }).set(auth(ana.token)).expect(200);
      expect(found.body.data).toHaveLength(0);

      const queue = await http().get('/v1/moderation/queue').set(auth(admin)).expect(200);
      expect(queue.body[0]).toMatchObject({ id: product, targetType: 'PRODUCT', moderationStatus: 'UNDER_REVIEW' });
      expect(await core.catalogAuditLog.count({ where: { targetId: product, action: 'pulled-by-flags' } })).toBe(1);
    });

    it('rejects a reason it does not know', async () => {
      const ben = await shopper();
      const product = (await core.product.findFirstOrThrow({ where: { origin: 'VERIFIED' } })).id;
      await http().post(`/v1/products/${product}/flags`).set(auth(ben.token)).send({ reason: 'BORING' }).expect(400);
    });
  });

  describe('shops', () => {
    it('keeps a shopper\'s shop to them until ten products are priced there, then shows it to everyone', async () => {
      const ana = await shopper();
      const ben = await shopper();

      const created = await addStore(ana.token).expect(201);
      const store = created.body.id;
      expect(created.body).toMatchObject({
        origin: 'COMMUNITY',
        visibility: 'PRIVATE',
        publication: { pricedProducts: 0, productsNeeded: 10, productsRemaining: 10 },
      });

      expect((await nearby(ana.token)).body.map((s: { id: string }) => s.id)).toContain(store);
      expect((await nearby(ben.token)).body.map((s: { id: string }) => s.id)).not.toContain(store);
      await http().get(`/v1/stores/${store}`).set(auth(ben.token)).expect(404);
      await http().get(`/v1/stores/${store}`).set(auth(admin)).expect(200);

      const listener = app.get(PriceAcceptedListener);
      const products = await core.product.findMany({ where: { origin: 'VERIFIED' }, take: 10 });
      for (const product of products.slice(0, 9)) {
        await listener.handle({ productId: product.id, storeId: store, userId: ana.id });
      }
      // The same product again counts once.
      await listener.handle({ productId: products[0].id, storeId: store, userId: ana.id });

      const nine = await http().get(`/v1/stores/${store}`).set(auth(ana.token)).expect(200);
      expect(nine.body.publication).toMatchObject({ pricedProducts: 9, productsRemaining: 1 });
      expect((await nearby(ben.token)).body.map((s: { id: string }) => s.id)).not.toContain(store);

      await listener.handle({ productId: products[9].id, storeId: store, userId: ana.id });

      const published = await http().get(`/v1/stores/${store}`).set(auth(ben.token)).expect(200);
      expect(published.body).toMatchObject({ visibility: 'PUBLIC', publication: null });
      expect((await nearby(ben.token)).body.map((s: { id: string }) => s.id)).toContain(store);
      expect(await core.catalogAuditLog.count({ where: { targetId: store, action: 'published' } })).toBe(1);
    });

    it('counts a real accepted price report toward the shop', async () => {
      const ana = await shopper(90);
      const store = (await addStore(ana.token, { name: 'Almacén Real', latitude: -34.61, longitude: -58.37 }).expect(201)).body.id;
      const product = (await core.product.findFirstOrThrow({ where: { origin: 'VERIFIED' } })).id;

      const report = await http()
        .post('/v1/price-observations')
        .set(auth(ana.token))
        .send({ productId: product, storeId: store, currency: 'ARS', priceCents: 1200 })
        .expect(201);
      expect(report.body.status).toBe('ACCEPTED');

      const deadline = Date.now() + 5000;
      let priced = 0;
      while (Date.now() < deadline && priced === 0) {
        priced = (await core.storeLocation.findUniqueOrThrow({ where: { id: store } })).pricedProductCount;
        if (priced === 0) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(priced).toBe(1);
    });

    it('lets a shopper name a chain that is not listed, reusing it if it exists', async () => {
      const ana = await shopper();
      const first = await addStore(ana.token, {
        supermarketId: undefined,
        supermarketName: 'Almacén Don Pepe',
        latitude: -34.62,
        longitude: -58.36,
      }).expect(201);
      const second = await addStore(ana.token, {
        supermarketId: undefined,
        supermarketName: 'almacen don pepe',
        name: 'Don Pepe 2',
        latitude: -34.63,
        longitude: -58.35,
      }).expect(201);

      expect(second.body.supermarketId).toBe(first.body.supermarketId);
      const chain = await core.supermarket.findUniqueOrThrow({ where: { id: first.body.supermarketId } });
      expect(chain.origin).toBe('COMMUNITY');
    });

    it('refuses the same chain a few metres from a shop it already has', async () => {
      const ana = await shopper();
      const ben = await shopper();
      await addStore(ana.token, { latitude: -34.64, longitude: -58.34 }).expect(201);

      const again = await addStore(ben.token, { latitude: -34.64015, longitude: -58.34 }).expect(409);
      // Someone else's private shop is not named.
      expect(again.body.message).toBe('This shop has already been added');

      await addStore(ben.token, { latitude: -34.65, longitude: -58.34 }).expect(201);
    });

    it('lets a brand-new account add one shop a day', async () => {
      const fresh = await shopper(0);
      await addStore(fresh.token, { latitude: -34.66, longitude: -58.33 }).expect(201);
      await addStore(fresh.token, { latitude: -34.67, longitude: -58.33 }).expect(429);
    });
  });

  describe('moderation', () => {
    it('lets the team verify, hide and restore, and nobody else', async () => {
      const ana = await shopper();
      const product = (await addProduct(ana.token, { name: 'Queso Cremoso de Campo' }).expect(201)).body.id;

      await http().post(`/v1/moderation/products/${product}/verify`).set(auth(ana.token)).expect(403);
      await http().get('/v1/moderation/queue').set(auth(ana.token)).expect(403);

      await http().post(`/v1/moderation/products/${product}/verify`).set(auth(admin)).expect(204);
      let read = await http().get(`/v1/products/${product}`).set(auth(ana.token)).expect(200);
      expect(read.body.origin).toBe('VERIFIED');
      expect((await core.product.findUniqueOrThrow({ where: { id: product } })).weight).toBe(150);

      await http().post(`/v1/moderation/products/${product}/hide`).set(auth(admin)).expect(204);
      const search = await http().get('/v1/products').query({ search: 'queso cremoso de campo' }).set(auth(ana.token)).expect(200);
      expect(search.body.data).toHaveLength(0);

      await http().post(`/v1/moderation/products/${product}/restore`).set(auth(admin)).expect(204);
      read = await http().get('/v1/products').query({ search: 'queso cremoso de campo' }).set(auth(ana.token)).expect(200);
      expect(read.body.data).toHaveLength(1);

      await http().post(`/v1/moderation/potatoes/${product}/hide`).set(auth(admin)).expect(400);
      expect(await core.catalogAuditLog.count({ where: { targetId: product } })).toBe(4);
    });

    it('publishes a private shop the team verifies', async () => {
      const ana = await shopper();
      const ben = await shopper();
      const store = (await addStore(ana.token, { latitude: -34.68, longitude: -58.32 }).expect(201)).body.id;

      await http().post(`/v1/moderation/stores/${store}/verify`).set(auth(admin)).expect(204);

      const read = await http().get(`/v1/stores/${store}`).set(auth(ben.token)).expect(200);
      expect(read.body).toMatchObject({ origin: 'VERIFIED', visibility: 'PUBLIC' });
    });
  });

  describe('what a shopper sees of their own part', () => {
    it('adds a product sent twice with the same id once, and refuses that id to anyone else', async () => {
      const ana = await shopper();
      const id = '7d6c1a52-4f1e-4a8b-9a51-3c2f8e0b9d11';

      const first = await addProduct(ana.token, { id, name: 'Galletitas de Agua Sin Sal' }).expect(201);
      const again = await addProduct(ana.token, { id, name: 'Galletitas de Agua Sin Sal' }).expect(201);
      expect(first.body.id).toBe(id);
      expect(again.body.id).toBe(id);
      expect(await core.product.count({ where: { id } })).toBe(1);

      const other = await shopper();
      await addProduct(other.token, { id, name: 'Otra cosa' }).expect(409);
    });

    it('adds a brand that is not listed, and reuses it the next time it is named', async () => {
      const ana = await shopper();
      const first = await addProduct(ana.token, { name: 'Dulce de Leche Repostero', brandName: 'Tía Nené' }).expect(201);
      const second = await addProduct(ana.token, { name: 'Dulce de Leche Clásico', brandName: 'tia nene' }).expect(201);
      expect(first.body.brand).toMatchObject({ name: 'Tía Nené' });
      expect(second.body.brand.id).toBe(first.body.brand.id);

      const suggestions = await http()
        .get('/v1/product-suggestions')
        .query({ name: 'dulce de leche' })
        .set(auth(ana.token))
        .expect(200);
      expect(suggestions.body).toEqual(expect.arrayContaining([expect.objectContaining({ brandName: 'Tía Nené' })]));
    });

    it('tells each person what they already said about a product', async () => {
      const ana = await shopper();
      const ben = await shopper(90, true);
      const product = (await addProduct(ana.token, { name: 'Pan Dulce Casero' }).expect(201)).body;
      const say = (token: string) =>
        http().get(`/v1/products/${product.id}/viewer-say`).set(auth(token)).expect(200);

      expect((await say(ana.token)).body).toEqual({ addedByYou: true, confirmed: false, flagged: false });
      await http().post(`/v1/products/${product.id}/confirmations`).set(auth(ben.token)).expect(200);
      await http().post(`/v1/products/${product.id}/flags`).set(auth(ben.token)).send({ reason: 'WRONG_INFO' }).expect(204);
      expect((await say(ben.token)).body).toEqual({ addedByYou: false, confirmed: true, flagged: true });
    });

    it('keeps a chain a shopper named out of everyone else\'s list until one of its shops is public', async () => {
      const ana = await shopper();
      const other = await shopper();
      await addStore(ana.token, {
        supermarketId: undefined,
        supermarketName: 'Almacén Secreto',
        name: 'Almacén Secreto Centro',
        latitude: -34.63,
        longitude: -58.41,
      }).expect(201);
      const chains = async (token: string) =>
        (await http().get('/v1/supermarkets').set(auth(token)).expect(200)).body.map((c: { name: string }) => c.name);

      expect(await chains(ana.token)).toContain('Almacén Secreto');
      expect(await chains(other.token)).not.toContain('Almacén Secreto');
      expect(await chains(other.token)).toContain('Coto');

      await core.storeLocation.updateMany({ where: { name: 'Almacén Secreto Centro' }, data: { publishedAt: new Date() } });
      expect(await chains(other.token)).toContain('Almacén Secreto');
    });

    it('lists what a shopper added with where each stands, and keeps a private shop from others', async () => {
      const ana = await shopper();
      const other = await shopper();
      const product = (await addProduct(ana.token, { name: 'Medialunas de Manteca' }).expect(201)).body;
      const store = (
        await addStore(ana.token, { name: 'Almacén Rosita', latitude: -34.62, longitude: -58.4 }).expect(201)
      ).body;

      const mine = await http().get('/v1/community/mine').set(auth(ana.token)).expect(200);
      expect(mine.body.products).toEqual([
        expect.objectContaining({ id: product.id, status: 'PUBLIC', confirmationCount: 0 }),
      ]);
      expect(mine.body.stores).toEqual([
        expect.objectContaining({ id: store.id, status: 'PRIVATE', pricedProducts: 0, productsRemaining: 10 }),
      ]);

      expect((await http().get(`/v1/stores/${store.id}/viewer-say`).set(auth(ana.token)).expect(200)).body).toMatchObject({
        addedByYou: true,
      });
      await http().get(`/v1/stores/${store.id}/viewer-say`).set(auth(other.token)).expect(404);
      expect((await http().get('/v1/community/mine').set(auth(other.token)).expect(200)).body).toEqual({
        products: [],
        stores: [],
      });
    });
  });
});
