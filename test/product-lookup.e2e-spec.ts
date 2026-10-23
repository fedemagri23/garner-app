import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { RedisService } from '../src/common/redis/redis.service.js';
import { PRODUCT_FACTS_SOURCE } from '../src/products/domain/product-facts.js';
import { CachedProductFacts } from '../src/products/infrastructure/cached-product-facts.js';
import { OpenFoodFactsSource } from '../src/products/infrastructure/open-food-facts.source.js';
import { createTestApp, registerWithRole, resetDatabase, uniqueEmail } from './helpers/test-app.js';

/** A valid EAN-13 from its first twelve digits. */
const ean13 = (first12: string) => {
  const sum = [...first12].reduce((total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
  return `${first12}${(10 - (sum % 10)) % 10}`;
};

const KNOWN = ean13('779123450001');
const MISSING = ean13('779123450002');
const BROKEN = ean13('779123450003');
const SLOW = ean13('779123450004');
const IN_CATALOG = ean13('779123450005');
const PICTURE = 'https://images.openfoodfacts.test/front.400.jpg';

/**
 * Stands in for Open Food Facts: answers by code, as their API v2 does, and
 * records what it was asked. Nothing in these tests reaches the internet.
 */
const off = {
  server: undefined as Server | undefined,
  asked: [] as { code: string; userAgent: string | undefined }[],
};

function answer(req: IncomingMessage, res: import('node:http').ServerResponse) {
  const code = /\/api\/v2\/product\/(\d+)\.json/.exec(req.url ?? '')?.[1] ?? '';
  off.asked.push({ code, userAgent: req.headers['user-agent'] });
  res.setHeader('content-type', 'application/json');

  if (code === KNOWN) {
    res.end(
      JSON.stringify({
        status: 1,
        product: {
          product_name: 'Alfajor de chocolate',
          product_name_de: 'Schokoladen-Alfajor',
          brands: 'Havanna, Grupo Havanna',
          quantity: '70 g',
          categories_tags: ['en:snacks', 'en:dairies'],
          image_front_url: PICTURE,
        },
      }),
    );
  } else if (code === BROKEN) {
    res.statusCode = 503;
    res.end('{}');
  } else if (code === SLOW) {
    setTimeout(() => res.end(JSON.stringify({ status: 0 })), 4_000);
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ status: 0, status_verbose: 'product not found' }));
  }
}

describe('Barcode lookup (e2e)', () => {
  let app: INestApplication<App>;
  let shopper: string;
  let dairyId: string;
  let categoryId: string;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());
  const lookup = (code: string, language?: string) =>
    http()
      .get(`/v1/product-lookup/${code}`)
      .query(language ? { language } : {})
      .set(auth(shopper));

  beforeAll(async () => {
    off.server = createServer(answer);
    await new Promise<void>((resolve) => off.server!.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(off.server.address() as AddressInfo).port}`;

    // The real client and cache, pointed at the stand-in, with keys of their own.
    app = (await createTestApp((builder) =>
      builder.overrideProvider(PRODUCT_FACTS_SOURCE).useFactory({
        inject: [RedisService],
        factory: (redis: RedisService) =>
          new CachedProductFacts(new OpenFoodFactsSource(url, 'Garner-test/1.0'), redis, `product-facts-test-${Date.now()}`),
      }),
    )) as INestApplication<App>;
    await resetDatabase(app);

    const admin = (await registerWithRole(app, 'ADMIN')).accessToken;
    dairyId = (await http().post('/v1/categories').set(auth(admin)).send({ name: 'Lácteos' }).expect(201)).body.id;
    categoryId = (await http().post('/v1/categories').set(auth(admin)).send({ name: 'Almacén' }).expect(201)).body.id;
    await http()
      .post('/v1/products')
      .set(auth(admin))
      .send({ name: 'Leche Entera 1L', categoryId: dairyId, unit: 'LITER', packageSize: 1, barcodes: [IN_CATALOG] })
      .expect(201);

    const registered = await http()
      .post('/v1/auth/register')
      .send({ email: uniqueEmail('lookup'), password: 'correct-horse-battery', displayName: 'Shopper' })
      .expect(201);
    shopper = registered.body.accessToken;
  });

  beforeEach(() => {
    off.asked = [];
  });

  afterAll(async () => {
    await resetDatabase(app);
    await app.close();
    await new Promise((resolve) => off.server!.close(resolve));
  });

  it('answers with our own product when the code is already in the catalog, without asking outside', async () => {
    const found = await lookup(IN_CATALOG).expect(200);

    expect(found.body).toMatchObject({ match: 'CATALOG', name: 'Leche Entera 1L', productId: expect.any(String) });
    expect(off.asked).toEqual([]);
  });

  it('turns what Open Food Facts knows into our fields, identifying itself', async () => {
    const found = await lookup(KNOWN).expect(200);

    expect(found.body).toEqual({
      match: 'OPEN_FOOD_FACTS',
      productId: null,
      name: 'Alfajor de chocolate',
      brandName: 'Havanna',
      packageSize: 70,
      unit: 'GRAM',
      categoryId: dairyId,
      imageUrl: PICTURE,
      sourceUrl: `https://world.openfoodfacts.org/product/${KNOWN}`,
    });
    expect(off.asked[0]?.userAgent).toBe('Garner-test/1.0');
  });

  it('prefers the name in the shopper’s language, and asks only once for a code', async () => {
    const found = await lookup(KNOWN, 'de').expect(200);

    expect(found.body.name).toBe('Schokoladen-Alfajor');
    expect(off.asked).toEqual([]); // the earlier lookup is cached
  });

  it('says NONE for a code nobody knows, and remembers that too', async () => {
    expect((await lookup(MISSING).expect(200)).body).toMatchObject({ match: 'NONE', name: null });
    expect((await lookup(MISSING).expect(200)).body.match).toBe('NONE');
    expect(off.asked).toHaveLength(1);
  });

  it('says NONE when the service fails, and asks again next time', async () => {
    expect((await lookup(BROKEN).expect(200)).body.match).toBe('NONE');
    expect((await lookup(BROKEN).expect(200)).body.match).toBe('NONE');
    expect(off.asked).toHaveLength(2);
  });

  it('says NONE rather than keep a shopper waiting', async () => {
    const started = Date.now();
    expect((await lookup(SLOW).expect(200)).body.match).toBe('NONE');
    expect(Date.now() - started).toBeLessThan(3_900);
  });

  it('refuses a code that is not a barcode', async () => {
    await lookup('7791234000028').expect(400);
  });

  it('gives a new product Open Food Facts’ picture from its own lookup, never a link sent', async () => {
    const created = await http()
      .post('/v1/products')
      .set(auth(shopper))
      .send({
        name: 'Alfajor de chocolate',
        categoryId,
        unit: 'GRAM',
        packageSize: 70,
        barcodes: [KNOWN],
        photoFromLookup: true,
        imageUrl: 'https://evil.test/x.png',
      })
      .expect(201);

    expect(created.body).toMatchObject({ imageUrl: PICTURE, imageSource: 'OPEN_FOOD_FACTS', origin: 'COMMUNITY' });
  });

  it('adds no picture when the lookup has none', async () => {
    const created = await http()
      .post('/v1/products')
      .set(auth(shopper))
      .send({ name: 'Producto sin foto', categoryId, unit: 'UNIT', barcodes: [MISSING], photoFromLookup: true })
      .expect(201);

    expect(created.body).toMatchObject({ imageUrl: null, imageSource: null });
  });
});
