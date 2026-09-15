import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  createTestApp,
  registerWithRole,
  resetDatabase,
  uniqueEmail,
} from './helpers/test-app.js';

/**
 * The catalog through the real HTTP stack: search, barcode lookup and the
 * curation rules that keep product identity stable.
 */
describe('Catalog (e2e)', () => {
  let app: INestApplication<App>;
  let curator: string;
  let shopper: string;
  let dairyId: string;
  let milkId: string;
  let brandId: string;
  let milkProductId: string;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = (await createTestApp()) as INestApplication<App>;
    await resetDatabase(app);

    curator = (await registerWithRole(app, 'MODERATOR')).accessToken;

    const registration = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: uniqueEmail('shopper'),
        password: 'correct-horse-battery',
        displayName: 'Shopper',
      })
      .expect(201);
    shopper = registration.body.accessToken;

    const dairy = await request(app.getHttpServer())
      .post('/v1/categories')
      .set(auth(curator))
      .send({ name: 'Lácteos' })
      .expect(201);
    dairyId = dairy.body.id;

    const milk = await request(app.getHttpServer())
      .post('/v1/categories')
      .set(auth(curator))
      .send({ name: 'Leche', parentId: dairyId })
      .expect(201);
    milkId = milk.body.id;

    const brand = await request(app.getHttpServer())
      .post('/v1/brands')
      .set(auth(curator))
      .send({ name: 'La Serenísima' })
      .expect(201);
    brandId = brand.body.id;

    const product = await request(app.getHttpServer())
      .post('/v1/products')
      .set(auth(curator))
      .send({
        name: 'Leche Entera 1L',
        categoryId: milkId,
        brandId,
        packageSize: 1,
        unit: 'LITER',
        barcodes: ['7790070410122'],
      })
      .expect(201);
    milkProductId = product.body.id;

    await request(app.getHttpServer())
      .post('/v1/products')
      .set(auth(curator))
      .send({
        name: 'Galletitas de Agua 300g',
        categoryId: dairyId,
        packageSize: 300,
        unit: 'GRAM',
      })
      .expect(201);
  });

  afterAll(async () => {
    await resetDatabase(app);
    await app.close();
  });

  describe('reference data', () => {
    it('derives a slug from the category name', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/categories')
        .set(auth(shopper))
        .expect(200);

      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Lácteos', slug: 'lacteos' }),
          expect.objectContaining({ name: 'Leche', parentId: dairyId }),
        ]),
      );
    });

    it('rejects a second category with the same name', async () => {
      await request(app.getHttpServer())
        .post('/v1/categories')
        .set(auth(curator))
        .send({ name: 'Lácteos' })
        .expect(409);
    });
  });

  describe('search', () => {
    it('finds a product by an unaccented fragment of its brand', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/products?search=serenisima')
        .set(auth(shopper))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(milkProductId);
    });

    it('finds a product by a fragment of its name', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/products?search=leche')
        .set(auth(shopper))
        .expect(200);

      expect(response.body.data[0].name).toBe('Leche Entera 1L');
    });

    it('browsing a parent category includes products filed under a child', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/products?categoryId=${dairyId}`)
        .set(auth(shopper))
        .expect(200);

      // The milk is filed under "Leche", which is a child of "Lácteos".
      expect(response.body.meta.totalItems).toBe(2);
    });

    it('narrows to the child category on its own', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/products?categoryId=${milkId}`)
        .set(auth(shopper))
        .expect(200);

      expect(response.body.meta.totalItems).toBe(1);
    });

    it('returns a pre-rendered package label', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/products?search=leche')
        .set(auth(shopper))
        .expect(200);

      expect(response.body.data[0].packageLabel).toBe('1 L');
    });

    it('paginates with bounded page sizes', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/products?page=1&pageSize=1')
        .set(auth(shopper))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta).toMatchObject({
        page: 1,
        pageSize: 1,
        totalItems: 2,
        totalPages: 2,
      });
    });

    it('rejects a page size beyond the cap', async () => {
      await request(app.getHttpServer())
        .get('/v1/products?pageSize=5000')
        .set(auth(shopper))
        .expect(400);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/v1/products').expect(401);
    });
  });

  describe('barcode lookup', () => {
    it('resolves a scanned code to its product', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/products/barcode/7790070410122')
        .set(auth(shopper))
        .expect(200);

      expect(response.body.id).toBe(milkProductId);
      expect(response.body.barcodes[0]).toMatchObject({
        code: '7790070410122',
        isPrimary: true,
      });
    });

    it('rejects a code whose checksum does not hold', async () => {
      await request(app.getHttpServer())
        .get('/v1/products/barcode/7790070410129')
        .set(auth(shopper))
        .expect(400);
    });

    it('reports a valid but unknown code as not found', async () => {
      await request(app.getHttpServer())
        .get('/v1/products/barcode/036000291452')
        .set(auth(shopper))
        .expect(404);
    });

    it('refuses to hand one barcode to a second product', async () => {
      await request(app.getHttpServer())
        .post('/v1/products')
        .set(auth(curator))
        .send({
          name: 'Leche Descremada 1L',
          categoryId: milkId,
          unit: 'LITER',
          barcodes: ['7790070410122'],
        })
        .expect(409);
    });
  });

  describe('product identity', () => {
    it('keeps the id and the price history anchor across a correction', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/v1/products/${milkProductId}`)
        .set(auth(curator))
        .send({ name: 'Leche Entera La Serenísima 1L' })
        .expect(200);

      expect(response.body.id).toBe(milkProductId);
      expect(response.body.name).toBe('Leche Entera La Serenísima 1L');

      // The corrected name is searchable by its new words, under the same id.
      const search = await request(app.getHttpServer())
        .get('/v1/products?search=entera')
        .set(auth(shopper))
        .expect(200);

      expect(search.body.data[0].id).toBe(milkProductId);
    });

    it('hides a retired product from search but keeps it addressable by id', async () => {
      const created = await request(app.getHttpServer())
        .post('/v1/products')
        .set(auth(curator))
        .send({
          name: 'Yogur Descontinuado 200g',
          categoryId: dairyId,
          unit: 'GRAM',
          packageSize: 200,
        })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/v1/products/${created.body.id}`)
        .set(auth(curator))
        .send({ isActive: false })
        .expect(200);

      const search = await request(app.getHttpServer())
        .get('/v1/products?search=descontinuado')
        .set(auth(shopper))
        .expect(200);
      expect(search.body.data).toHaveLength(0);

      // Still resolvable, because prices recorded against it still point here.
      const detail = await request(app.getHttpServer())
        .get(`/v1/products/${created.body.id}`)
        .set(auth(shopper))
        .expect(200);
      expect(detail.body.isActive).toBe(false);
    });

    it('attaches a second barcode to an existing product', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/products/${milkProductId}/barcodes`)
        .set(auth(curator))
        .send({ code: '96385074' })
        .expect(201);

      expect(response.body.barcodes).toHaveLength(2);
      expect(
        response.body.barcodes.filter(
          (barcode: { isPrimary: boolean }) => barcode.isPrimary,
        ),
      ).toHaveLength(1);
    });
  });

  describe('curation is restricted', () => {
    it('refuses a product write from an ordinary shopper', async () => {
      await request(app.getHttpServer())
        .post('/v1/products')
        .set(auth(shopper))
        .send({ name: 'Rogue Product', categoryId: milkId, unit: 'UNIT' })
        .expect(403);
    });

    it('refuses a category write from an ordinary shopper', async () => {
      await request(app.getHttpServer())
        .post('/v1/categories')
        .set(auth(shopper))
        .send({ name: 'Rogue Category' })
        .expect(403);
    });

    it('refuses an unauthenticated write outright', async () => {
      await request(app.getHttpServer())
        .post('/v1/products')
        .send({ name: 'Anonymous', categoryId: milkId, unit: 'UNIT' })
        .expect(401);
    });

    it('rejects a product in a category that does not exist', async () => {
      await request(app.getHttpServer())
        .post('/v1/products')
        .set(auth(curator))
        .send({
          name: 'Orphan',
          categoryId: '00000000-0000-4000-8000-000000000000',
          unit: 'UNIT',
        })
        .expect(404);
    });

    it('rejects unknown properties rather than dropping them', async () => {
      await request(app.getHttpServer())
        .post('/v1/products')
        .set(auth(curator))
        .send({
          name: 'Sneaky',
          categoryId: milkId,
          unit: 'UNIT',
          isActive: false,
        })
        .expect(400);
    });
  });
});
