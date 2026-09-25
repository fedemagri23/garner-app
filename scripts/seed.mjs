/**
 * Fills the development databases with a small, coherent world: two accounts,
 * a catalog, three chains with branches around Buenos Aires, and derived
 * prices that differ per store so comparison and optimization have something
 * to say.
 *
 * Idempotent — running it again rewrites the same rows rather than adding
 * more, so it is safe to re-run while poking at the app.
 *
 * Development only. It writes directly to the databases and sets a role no
 * API exposes, which is exactly what makes it a seed and not a feature.
 */
import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient as CoreClient } from '../generated/prisma/core/index.js';
import { PrismaClient as IntelligenceClient } from '../generated/prisma/intelligence/index.js';

const core = new CoreClient({
  adapter: new PrismaPg({ connectionString: process.env.CORE_DB_URL }),
});
const intelligence = new IntelligenceClient({
  adapter: new PrismaPg({ connectionString: process.env.INTELLIGENCE_DB_URL }),
});

const PASSWORD = 'correct-horse-battery';

/** Obelisco, central Buenos Aires: where the demo shopper stands. */
const HOME = { latitude: -34.6037, longitude: -58.3816 };

const kmSouth = (km) => HOME.latitude - km / 111.32;

async function upsertUser(email, displayName, role) {
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });

  return core.user.upsert({
    where: { email },
    create: { email, displayName, role, passwordHash },
    update: { displayName, role },
  });
}

async function upsertCategory(name, slug, parentId = null) {
  return core.category.upsert({
    where: { slug },
    create: { name, slug, parentId },
    update: { name, parentId },
  });
}

async function upsertBrand(name, slug, normalizedName) {
  return core.brand.upsert({
    where: { slug },
    create: { name, slug, normalizedName },
    update: { name, normalizedName },
  });
}

async function upsertProduct(product) {
  const existing = await core.product.findFirst({
    where: { normalizedName: product.normalizedName },
  });

  const row = existing
    ? await core.product.update({ where: { id: existing.id }, data: product })
    : await core.product.create({ data: product });

  return row;
}

async function upsertStore(supermarketId, store) {
  const existing = await core.storeLocation.findFirst({
    where: { supermarketId, name: store.name },
  });

  const data = {
    supermarketId,
    addressLine: store.addressLine,
    city: 'Buenos Aires',
    country: 'AR',
    latitude: store.latitude,
    longitude: store.longitude,
    name: store.name,
  };

  const row = existing
    ? await core.storeLocation.update({ where: { id: existing.id }, data })
    : await core.storeLocation.create({ data });

  // Open every weekday, so "is it open now" answers sensibly.
  await core.storeOpeningHours.deleteMany({ where: { storeLocationId: row.id } });
  await core.storeOpeningHours.createMany({
    data: [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      storeLocationId: row.id,
      dayOfWeek,
      opensAt: '08:00',
      closesAt: '22:00',
    })),
  });

  return row;
}

async function setDerivedPrice(productId, storeId, priceCents) {
  const lastObservedAt = new Date(Date.now() - 6 * 60 * 60 * 1000);

  await intelligence.derivedPrice.upsert({
    where: { productId_storeId: { productId, storeId } },
    create: {
      productId,
      storeId,
      currency: 'ARS',
      priceCents,
      minPriceCents: Math.round(priceCents * 0.97),
      maxPriceCents: Math.round(priceCents * 1.03),
      confidence: 0.86,
      confidenceLevel: 'VERY_RECENT',
      observationCount: 4,
      lastObservedAt,
    },
    update: { priceCents, lastObservedAt },
  });
}

/** A fortnight of daily history, drifting upward, so trends are non-trivial. */
async function seedHistory(productId, storeId, endPriceCents) {
  const days = 14;

  for (let ago = days; ago >= 1; ago--) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - ago);
    date.setUTCHours(0, 0, 0, 0);

    // Drifts up toward today's price, with a gentle wobble.
    const drift = 1 - (ago / days) * 0.12;
    const wobble = 1 + Math.sin(ago) * 0.01;
    const average = Math.round(endPriceCents * drift * wobble);

    await intelligence.dailyPriceHistory.upsert({
      where: { productId_storeId_date: { productId, storeId, date } },
      create: {
        productId,
        storeId,
        date,
        currency: 'ARS',
        weightedAverageCents: average,
        minPriceCents: Math.round(average * 0.96),
        maxPriceCents: Math.round(average * 1.04),
        observationCount: 3,
        confidence: 0.8,
      },
      update: { weightedAverageCents: average },
    });
  }
}

async function main() {
  console.log('Seeding development data…');

  const [admin, shopper] = await Promise.all([
    upsertUser('admin@garner.test', 'Garner Admin', 'ADMIN'),
    upsertUser('shopper@garner.test', 'Fede', 'USER'),
  ]);

  const almacen = await upsertCategory('Almacén', 'almacen');
  const lacteos = await upsertCategory('Lácteos', 'lacteos');
  const leche = await upsertCategory('Leche', 'leche', lacteos.id);
  const bebidas = await upsertCategory('Bebidas', 'bebidas');

  const serenisima = await upsertBrand('La Serenísima', 'la-serenisima', 'la serenisima');
  const arcor = await upsertBrand('Arcor', 'arcor', 'arcor');

  const products = await Promise.all([
    upsertProduct({
      name: 'Leche Entera La Serenísima 1L',
      normalizedName: 'leche entera la serenisima 1l',
      categoryId: leche.id,
      brandId: serenisima.id,
      packageSize: 1,
      unit: 'LITER',
    }),
    upsertProduct({
      name: 'Pan Lactal 500g',
      normalizedName: 'pan lactal 500g',
      categoryId: almacen.id,
      packageSize: 500,
      unit: 'GRAM',
    }),
    upsertProduct({
      name: 'Arroz Largo Fino 1kg',
      normalizedName: 'arroz largo fino 1kg',
      categoryId: almacen.id,
      packageSize: 1,
      unit: 'KILOGRAM',
    }),
    upsertProduct({
      name: 'Aceite de Girasol 900ml',
      normalizedName: 'aceite de girasol 900ml',
      categoryId: almacen.id,
      packageSize: 900,
      unit: 'MILLILITER',
    }),
    upsertProduct({
      name: 'Galletitas Surtidas Arcor 400g',
      normalizedName: 'galletitas surtidas arcor 400g',
      categoryId: almacen.id,
      brandId: arcor.id,
      packageSize: 400,
      unit: 'GRAM',
    }),
    upsertProduct({
      name: 'Agua Mineral 2L',
      normalizedName: 'agua mineral 2l',
      categoryId: bebidas.id,
      packageSize: 2,
      unit: 'LITER',
    }),
  ]);

  // A scannable barcode on the milk, for the barcode lookup endpoint.
  await core.productBarcode.upsert({
    where: { code: '7790070410122' },
    create: { code: '7790070410122', productId: products[0].id, isPrimary: true },
    update: { productId: products[0].id },
  });

  const chains = {};
  for (const [name, slug] of [
    ['Coto', 'coto'],
    ['Carrefour', 'carrefour'],
    ['Día', 'dia'],
  ]) {
    chains[slug] = await core.supermarket.upsert({
      where: { slug },
      create: { name, slug },
      update: { name },
    });
  }

  const stores = {
    cotoCentro: await upsertStore(chains.coto.id, {
      name: 'Coto Centro',
      addressLine: 'Av. Corrientes 1200',
      latitude: kmSouth(0.6),
      longitude: HOME.longitude,
    }),
    carrefourAlmagro: await upsertStore(chains.carrefour.id, {
      name: 'Carrefour Almagro',
      addressLine: 'Av. Rivadavia 3900',
      latitude: kmSouth(2.5),
      longitude: HOME.longitude - 0.01,
    }),
    diaCaballito: await upsertStore(chains.dia.id, {
      name: 'Día Caballito',
      addressLine: 'Av. La Plata 100',
      latitude: kmSouth(4),
      longitude: HOME.longitude - 0.02,
    }),
  };

  // Prices differ per chain so every recommendation mode has a real answer:
  // Coto is convenient but dearer, Día is cheapest and furthest.
  const priceTable = [
    // product index, [Coto, Carrefour, Día]
    [0, [149000, 139000, 132000]],
    [1, [128000, 119000, 115000]],
    [2, [185000, 179000, 168000]],
    [3, [242000, 235000, 219000]],
    [4, [162000, 158000, 149000]],
    [5, [98000, 94000, 89000]],
  ];

  const storeOrder = [
    stores.cotoCentro,
    stores.carrefourAlmagro,
    stores.diaCaballito,
  ];

  for (const [productIndex, prices] of priceTable) {
    for (const [storeIndex, priceCents] of prices.entries()) {
      const product = products[productIndex];
      const store = storeOrder[storeIndex];

      await setDerivedPrice(product.id, store.id, priceCents);
      await seedHistory(product.id, store.id, priceCents);
    }
  }

  // A list ready to optimize.
  const list = await core.shoppingList.upsert({
    where: { id: '11111111-1111-4111-8111-111111111111' },
    create: {
      id: '11111111-1111-4111-8111-111111111111',
      ownerId: shopper.id,
      name: 'Compra semanal',
      currency: 'ARS',
    },
    update: { ownerId: shopper.id, name: 'Compra semanal' },
  });

  await core.shoppingListItem.deleteMany({ where: { listId: list.id } });
  await core.shoppingListItem.createMany({
    data: [
      { listId: list.id, productId: products[0].id, quantity: 2, expectedUnitPriceCents: 140000, position: 1000 },
      { listId: list.id, productId: products[1].id, quantity: 1, expectedUnitPriceCents: 120000, position: 2000 },
      { listId: list.id, productId: products[2].id, quantity: 1, expectedUnitPriceCents: 180000, position: 3000 },
      { listId: list.id, productId: products[5].id, quantity: 3, position: 4000 },
    ],
  });

  console.log(`
Seeded:
  users        admin@garner.test (ADMIN), shopper@garner.test (USER)
  password     ${PASSWORD}
  catalog      ${products.length} products, 4 categories, 2 brands, 1 barcode
  stores       ${storeOrder.length} across Coto, Carrefour and Día
  prices       current price + 14 days of history per product/store
  list         "Compra semanal" (4 items) owned by the shopper
  home point   ${HOME.latitude}, ${HOME.longitude}
`);
}

try {
  await main();
} finally {
  await Promise.all([core.$disconnect(), intelligence.$disconnect()]);
}
