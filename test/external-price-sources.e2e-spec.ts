import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppConfigService } from '../src/common/config/app-config.service.js';
import { PricingPrismaService } from '../src/common/database/pricing-prisma.service.js';
import { RunSourceImportUseCase } from '../src/external-price-sources/application/run-source-import.use-case.js';
import {
  createTestApp,
  registerWithRole,
  resetDatabase,
  uniqueEmail,
} from './helpers/test-app.js';

/**
 * A full import through the sandbox adapter: a source is registered, its
 * branches mapped, and its feed turned into observations — with the products
 * it names matched, left for review, or ignored.
 */
describe('External price sources (e2e)', () => {
  let app: INestApplication<App>;
  let pricing: PricingPrismaService;
  let runImport: RunSourceImportUseCase;
  let sandboxDir: string;

  let admin: string;
  let shopper: string;
  let supermarketId: string;
  let storeId: string;
  let milkId: string;
  let breadId: string;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  const writeFixture = async (name: string, contents: unknown) => {
    await writeFile(
      resolve(sandboxDir, name),
      JSON.stringify(contents, null, 2),
      'utf8',
    );
  };

  const createSource = async (
    name: string,
    config: Record<string, unknown>,
  ): Promise<string> =>
    (
      await http()
        .post('/v1/price-sources')
        .set(auth(admin))
        .send({ name, supermarketId, adapterKey: 'sandbox-file', config })
        .expect(201)
    ).body.id;

  beforeAll(async () => {
    app = (await createTestApp()) as INestApplication<App>;
    await resetDatabase(app);

    pricing = app.get(PricingPrismaService);
    runImport = app.get(RunSourceImportUseCase);
    sandboxDir = resolve(app.get(AppConfigService).externalSourceSandboxDir);
    await mkdir(sandboxDir, { recursive: true });

    admin = (await registerWithRole(app, 'ADMIN')).accessToken;
    shopper = (
      await http()
        .post('/v1/auth/register')
        .send({
          email: uniqueEmail('import-shopper'),
          password: 'correct-horse-battery',
          displayName: 'Shopper',
        })
        .expect(201)
    ).body.accessToken;

    const categoryId = (
      await http()
        .post('/v1/categories')
        .set(auth(admin))
        .send({ name: 'Almacén' })
        .expect(201)
    ).body.id;

    const product = async (name: string, extra: Record<string, unknown> = {}) =>
      (
        await http()
          .post('/v1/products')
          .set(auth(admin))
          .send({ name, categoryId, unit: 'LITER', packageSize: 1, ...extra })
          .expect(201)
      ).body.id as string;

    milkId = await product('Leche Entera 1L', { barcodes: ['7790070410122'] });
    breadId = await product('Pan Lactal 500g', { unit: 'GRAM', packageSize: 500 });

    const chain = await http()
      .post('/v1/supermarkets')
      .set(auth(admin))
      .send({ name: 'Carrefour' })
      .expect(201);
    supermarketId = chain.body.id;

    storeId = (
      await http()
        .post('/v1/stores')
        .set(auth(admin))
        .send({
          supermarketId,
          name: 'Carrefour Caballito',
          addressLine: 'Av. Rivadavia 5000',
          city: 'Buenos Aires',
          country: 'AR',
          latitude: -34.618,
          longitude: -58.44,
        })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await resetDatabase(app);
    await rm(sandboxDir, { recursive: true, force: true });
    await app.close();
  });

  describe('registry', () => {
    it('lists the adapters this deployment can run', async () => {
      const response = await http()
        .get('/v1/price-sources/adapters')
        .set(auth(admin))
        .expect(200);

      expect(response.body.adapters).toEqual(
        expect.arrayContaining(['json-http', 'sandbox-file']),
      );
    });

    it('refuses a source naming an adapter that does not exist', async () => {
      await http()
        .post('/v1/price-sources')
        .set(auth(admin))
        .send({ name: 'Ghost', supermarketId, adapterKey: 'carrier-pigeon' })
        .expect(400);
    });

    it('refuses a source for a supermarket that does not exist', async () => {
      await http()
        .post('/v1/price-sources')
        .set(auth(admin))
        .send({
          name: 'Orphan',
          supermarketId: randomUUID(),
          adapterKey: 'sandbox-file',
        })
        .expect(404);
    });

    it('is closed to everyone but administrators', async () => {
      await http().get('/v1/price-sources').set(auth(shopper)).expect(403);
      await http().get('/v1/price-sources').expect(401);
    });
  });

  describe('importing', () => {
    let sourceId: string;

    beforeAll(async () => {
      await writeFixture('carrefour-products.json', [
        // Matches on barcode, though the feed words the name differently.
        {
          externalId: 'SKU-MILK',
          name: 'LECHE ENTERA LARGA VIDA 1 LT',
          barcode: '7790070410122',
        },
        // Matches on normalized name and package.
        {
          externalId: 'SKU-BREAD',
          name: 'Pan Lactal 500g',
          packageSize: 500,
          unit: 'gr',
        },
        // Nothing in the catalog answers to this.
        { externalId: 'SKU-MYSTERY', name: 'Producto Desconocido XYZ' },
      ]);

      await writeFixture('carrefour-prices.json', [
        {
          externalProductId: 'SKU-MILK',
          externalStoreId: 'branch-7',
          priceCents: 430,
          currency: 'ARS',
        },
        {
          externalProductId: 'SKU-BREAD',
          externalStoreId: 'branch-7',
          priceCents: 890,
          currency: 'ARS',
        },
        {
          externalProductId: 'SKU-MYSTERY',
          externalStoreId: 'branch-7',
          priceCents: 100,
          currency: 'ARS',
        },
        // A branch nobody has mapped to a store.
        {
          externalProductId: 'SKU-MILK',
          externalStoreId: 'branch-99',
          priceCents: 440,
          currency: 'ARS',
        },
      ]);

      sourceId = await createSource('Carrefour Feed', {
        productsFile: 'carrefour-products.json',
        pricesFile: 'carrefour-prices.json',
      });

      await http()
        .post(`/v1/price-sources/${sourceId}/stores`)
        .set(auth(admin))
        .send({ externalStoreId: 'branch-7', storeId })
        .expect(204);
    });

    it('matches by barcode and by name, and leaves the rest for a person', async () => {
      const response = await http()
        .post(`/v1/price-sources/${sourceId}/imports`)
        .set(auth(admin))
        .expect(201);

      expect(response.body).toMatchObject({
        status: 'PARTIAL',
        productsSeen: 3,
        pricesSeen: 4,
        matchedProducts: 2,
        unmatchedProducts: 1,
        observationsCreated: 2,
        // The unknown product's price, and the unmapped branch's.
        skippedPrices: 2,
      });

      const observations = await pricing.priceObservation.findMany({
        where: { sourceType: 'EXTERNAL_API' },
        orderBy: { priceCents: 'asc' },
      });

      expect(observations.map((row) => row.priceCents)).toEqual([430, 890]);
      expect(observations[0]).toMatchObject({
        productId: milkId,
        storeId,
        status: 'ACCEPTED',
        userId: null,
      });
      expect(observations[1].productId).toBe(breadId);
    });

    it('does not import the same day twice', async () => {
      const before = await pricing.priceObservation.count({
        where: { sourceType: 'EXTERNAL_API' },
      });

      const second = await http()
        .post(`/v1/price-sources/${sourceId}/imports`)
        .set(auth(admin))
        .expect(201);

      expect(second.body.status).toBe('PARTIAL');
      expect(
        await pricing.priceObservation.count({ where: { sourceType: 'EXTERNAL_API' } }),
      ).toBe(before);
    });

    it('creates no duplicate observations when a run is repeated', async () => {
      const before = await pricing.priceObservation.count({
        where: { sourceType: 'EXTERNAL_API' },
      });

      // Same slot key, as a retried job would use.
      await runImport.execute(sourceId, 'retry-slot');
      await runImport.execute(sourceId, 'retry-slot');

      const after = await pricing.priceObservation.count({
        where: { sourceType: 'EXTERNAL_API' },
      });

      // One extra slot's worth, however many times it ran.
      expect(after).toBe(before + 2);
    });

    it('shows the import history and the source status', async () => {
      const runs = await http()
        .get(`/v1/price-sources/${sourceId}/imports`)
        .set(auth(admin))
        .expect(200);

      expect(runs.body.length).toBeGreaterThan(0);
      expect(runs.body[0]).toMatchObject({
        status: expect.stringMatching(/COMPLETED|PARTIAL/),
        runKey: expect.any(String),
      });

      const source = await http()
        .get(`/v1/price-sources/${sourceId}`)
        .set(auth(admin))
        .expect(200);

      expect(source.body).toMatchObject({
        lastStatus: 'PARTIAL',
        consecutiveFailures: 0,
      });
      expect(source.body.lastSuccessfulRunAt).not.toBeNull();
    });

    it('never invents a canonical product for what it could not match', async () => {
      const products = await http()
        .get('/v1/products?search=desconocido')
        .set(auth(shopper))
        .expect(200);

      expect(products.body.data).toHaveLength(0);
    });
  });

  describe('manual matching', () => {
    let sourceId: string;

    beforeAll(async () => {
      await writeFixture('manual-products.json', [
        { externalId: 'SKU-ODD', name: 'Leche Rara 1L' },
      ]);
      await writeFixture('manual-prices.json', [
        {
          externalProductId: 'SKU-ODD',
          externalStoreId: 'branch-7',
          priceCents: 470,
          currency: 'ARS',
        },
      ]);

      sourceId = await createSource('Manual Feed', {
        productsFile: 'manual-products.json',
        pricesFile: 'manual-prices.json',
      });

      await http()
        .post(`/v1/price-sources/${sourceId}/stores`)
        .set(auth(admin))
        .send({ externalStoreId: 'branch-7', storeId })
        .expect(204);

      await runImport.execute(sourceId, 'first');
    });

    it('queues what it could not match for review', async () => {
      const response = await http()
        .get(`/v1/price-sources/${sourceId}/products`)
        .set(auth(admin))
        .expect(200);

      expect(response.body.data).toEqual([
        expect.objectContaining({
          externalProductId: 'SKU-ODD',
          externalName: 'Leche Rara 1L',
          status: 'UNMATCHED',
          productId: null,
        }),
      ]);
    });

    it('applies a person’s match on the next import', async () => {
      await http()
        .post(`/v1/price-sources/${sourceId}/products/SKU-ODD`)
        .set(auth(admin))
        .send({ productId: milkId })
        .expect(200);

      const { status } = await runImport.execute(sourceId, 'after-match');
      expect(status).toBe('COMPLETED');

      const observation = await pricing.priceObservation.findFirst({
        where: { priceCents: 470, sourceType: 'EXTERNAL_API' },
      });
      expect(observation).toMatchObject({ productId: milkId, storeId });
    });

    it('keeps ignoring a product a person dismissed', async () => {
      await http()
        .post(`/v1/price-sources/${sourceId}/products/SKU-ODD`)
        .set(auth(admin))
        .send({ ignore: true })
        .expect(200);

      const { run } = await runImport.execute(sourceId, 'after-ignore');

      expect(run.matchedProducts).toBe(0);
      expect(run.skippedPrices).toBe(1);
    });

    it('refuses a decision that is neither a match nor an ignore', async () => {
      await http()
        .post(`/v1/price-sources/${sourceId}/products/SKU-ODD`)
        .set(auth(admin))
        .send({ productId: milkId, ignore: true })
        .expect(400);
    });

    it('refuses to map a store belonging to another supermarket', async () => {
      const otherChain = await http()
        .post('/v1/supermarkets')
        .set(auth(admin))
        .send({ name: 'Vea' })
        .expect(201);

      const otherStore = await http()
        .post('/v1/stores')
        .set(auth(admin))
        .send({
          supermarketId: otherChain.body.id,
          name: 'Vea Centro',
          addressLine: 'Calle 1',
          city: 'Buenos Aires',
          country: 'AR',
          latitude: -34.6,
          longitude: -58.4,
        })
        .expect(201);

      await http()
        .post(`/v1/price-sources/${sourceId}/stores`)
        .set(auth(admin))
        .send({ externalStoreId: 'branch-8', storeId: otherStore.body.id })
        .expect(400);
    });
  });

  describe('failure isolation', () => {
    it('fails only the broken source, and keeps the others importing', async () => {
      const broken = await createSource('Broken Feed', {
        productsFile: 'missing.json',
        pricesFile: 'missing.json',
      });

      const healthy = await createSource('Healthy Feed', {
        productsFile: 'carrefour-products.json',
        pricesFile: 'carrefour-prices.json',
      });
      await http()
        .post(`/v1/price-sources/${healthy}/stores`)
        .set(auth(admin))
        .send({ externalStoreId: 'branch-7', storeId })
        .expect(204);

      const brokenRun = await runImport.execute(broken, 'isolation');
      const healthyRun = await runImport.execute(healthy, 'isolation');

      expect(brokenRun.status).toBe('FAILED');
      expect(brokenRun.run.error).toContain('missing.json');
      expect(healthyRun.status).toBe('PARTIAL');
      expect(healthyRun.run.observationsCreated).toBe(2);

      const state = await http()
        .get(`/v1/price-sources/${broken}`)
        .set(auth(admin))
        .expect(200);

      expect(state.body).toMatchObject({
        lastStatus: 'FAILED',
        consecutiveFailures: 1,
        lastSuccessfulRunAt: null,
      });
    });

    it('will not read a fixture outside the sandbox directory', async () => {
      const escaping = await createSource('Escaping Feed', {
        productsFile: '../../../etc/passwd',
        pricesFile: '../../../etc/passwd',
      });

      const { run, status } = await runImport.execute(escaping, 'escape');

      expect(status).toBe('FAILED');
      expect(run.error).toContain('outside the sandbox');
    });

    it('stops importing from a source once it is disabled', async () => {
      const disabled = await createSource('Disabled Feed', {
        productsFile: 'carrefour-products.json',
        pricesFile: 'carrefour-prices.json',
      });

      await http()
        .patch(`/v1/price-sources/${disabled}`)
        .set(auth(admin))
        .send({ isEnabled: false })
        .expect(200);

      const sources = await http()
        .get('/v1/price-sources')
        .set(auth(admin))
        .expect(200);

      expect(
        sources.body.find((source: { id: string }) => source.id === disabled),
      ).toMatchObject({ isEnabled: false });
    });
  });
});
