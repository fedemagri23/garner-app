/**
 * Fills the development databases with a small, coherent world: two accounts,
 * a catalog, and two neighbourhoods of stores — around the Obelisco in Buenos
 * Aires (pesos) and around Stephansplatz in Vienna (euros) — with derived
 * prices that differ per store so comparison and optimization have something
 * to say, and a few price drops for the home screen's "Bajaron cerca tuyo".
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

/** Stephansplatz, central Vienna: the second demo neighbourhood. */
const VIENNA = { latitude: 48.2085, longitude: 16.3721 };

const kmSouth = (km) => HOME.latitude - km / 111.32;

const BUENOS_AIRES = {
  city: 'Buenos Aires',
  country: 'AR',
  timeZone: 'America/Argentina/Buenos_Aires',
  currency: 'ARS',
  // Monday to Saturday, 08:00–22:00.
  hours: [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, opensAt: '08:00', closesAt: '22:00' })),
};

const WIEN = {
  city: 'Wien',
  country: 'AT',
  timeZone: 'Europe/Vienna',
  currency: 'EUR',
  // Austrian shop hours: weekdays to 20:00, Saturday to 18:00, Sunday closed.
  hours: [
    ...[1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, opensAt: '07:30', closesAt: '20:00' })),
    { dayOfWeek: 6, opensAt: '07:30', closesAt: '18:00' },
  ],
};

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

async function upsertProduct(fields) {
  // The team's, unless said otherwise, and ranked as such (VERIFIED_BONUS).
  const product = { origin: 'VERIFIED', weight: 150, ...fields };
  const existing = await core.product.findFirst({
    where: { normalizedName: product.normalizedName },
  });

  const row = existing
    ? await core.product.update({ where: { id: existing.id }, data: product })
    : await core.product.create({ data: product });

  return row;
}

async function upsertStore(supermarketId, store, place = BUENOS_AIRES) {
  const existing = await core.storeLocation.findFirst({
    where: { supermarketId, name: store.name },
  });

  const data = {
    supermarketId,
    addressLine: store.addressLine,
    city: place.city,
    country: place.country,
    timeZone: place.timeZone,
    latitude: store.latitude,
    longitude: store.longitude,
    name: store.name,
  };

  const row = existing
    ? await core.storeLocation.update({ where: { id: existing.id }, data })
    : await core.storeLocation.create({ data });

  // Local hours, so "is it open now" answers sensibly in each city.
  await core.storeOpeningHours.deleteMany({ where: { storeLocationId: row.id } });
  await core.storeOpeningHours.createMany({
    data: place.hours.map((interval) => ({ storeLocationId: row.id, ...interval })),
  });

  return row;
}

async function setDerivedPrice(productId, storeId, priceCents, currency) {
  const lastObservedAt = new Date(Date.now() - 6 * 60 * 60 * 1000);

  await intelligence.derivedPrice.upsert({
    where: { productId_storeId: { productId, storeId } },
    create: {
      productId,
      storeId,
      currency,
      priceCents,
      minPriceCents: Math.round(priceCents * 0.97),
      maxPriceCents: Math.round(priceCents * 1.03),
      confidence: 0.86,
      confidenceLevel: 'VERY_RECENT',
      observationCount: 4,
      lastObservedAt,
    },
    update: { priceCents, currency, lastObservedAt },
  });
}

/** A fortnight of daily history, drifting upward, so trends are non-trivial. */
async function seedHistory(productId, storeId, endPriceCents, currency) {
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
        currency,
        weightedAverageCents: average,
        minPriceCents: Math.round(average * 0.96),
        maxPriceCents: Math.round(average * 1.04),
        observationCount: 3,
        confidence: 0.8,
      },
      update: { weightedAverageCents: average, currency },
    });
  }
}

/** A recent fall to the current price, as the recompute would have recorded. */
async function setPriceDrop(productId, storeId, currency, priceCents, previousPriceCents) {
  const droppedAt = new Date(Date.now() - 6 * 60 * 60 * 1000);

  await intelligence.priceDrop.upsert({
    where: { productId_storeId: { productId, storeId } },
    create: { productId, storeId, currency, priceCents, previousPriceCents, droppedAt },
    update: { currency, priceCents, previousPriceCents, droppedAt },
  });
}

async function main() {
  console.log('Seeding development data…');

  const [admin, shopper, moderator, neighbour] = await Promise.all([
    upsertUser('admin@garner.test', 'Garner Admin', 'ADMIN'),
    upsertUser('shopper@garner.test', 'Fede', 'USER'),
    upsertUser('moderator@garner.test', 'Garner Moderator', 'MODERATOR'),
    upsertUser('vecina@garner.test', 'Vecina', 'USER'),
  ]);
  // Established accounts: their price reports count at once and they may add
  // a few products and shops a day (a brand-new account's are held back).
  const DAY_MS = 86_400_000;
  await core.user.update({ where: { id: shopper.id }, data: { createdAt: new Date(Date.now() - 90 * DAY_MS) } });
  await core.user.update({ where: { id: neighbour.id }, data: { createdAt: new Date(Date.now() - 30 * DAY_MS) } });

  // A saved location, for when the app is not allowed to use the phone's.
  const savedLocation = { ...HOME, locationLabel: 'Centro' };
  await core.userPreferences.upsert({
    where: { userId: shopper.id },
    create: { userId: shopper.id, ...savedLocation },
    update: savedLocation,
  });

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

  // A scannable EAN-13 on every product, for the app's scanner. garner-mobile's
  // docs/barcodes.svg draws these same codes, to scan from a screen.
  const barcodes = [
    '7790070410122', // milk
    '7791234000012', // bread
    '7791234000029', // rice
    '7791234000036', // oil
    '7790767000049', // biscuits
    '7791234000050', // water
  ];
  for (const [index, code] of barcodes.entries()) {
    await core.productBarcode.upsert({
      where: { code },
      create: { code, productId: products[index].id, isPrimary: true },
      update: { productId: products[index].id, isPrimary: true },
    });
  }

  const chains = {};
  for (const [name, slug] of [
    ['Coto', 'coto'],
    ['Carrefour', 'carrefour'],
    ['Día', 'dia'],
    ['Billa', 'billa'],
    ['Spar', 'spar'],
    ['Hofer', 'hofer'],
  ]) {
    chains[slug] = await core.supermarket.upsert({
      where: { slug },
      create: { name, slug },
      update: { name },
    });
  }

  /**
   * Three stores, a price per product at each, and some of those prices
   * having just fallen: product index, store index, price before.
   */
  async function seedNeighbourhood(place, stores, priceTable, drops) {
    const dropBefore = new Map(
      drops.map(([productIndex, storeIndex, before]) => [`${productIndex}:${storeIndex}`, before]),
    );

    for (const [productIndex, prices] of priceTable) {
      for (const [storeIndex, priceCents] of prices.entries()) {
        const product = products[productIndex];
        const store = stores[storeIndex];
        const before = dropBefore.get(`${productIndex}:${storeIndex}`);

        await setDerivedPrice(product.id, store.id, priceCents, place.currency);
        // A dropped price's history runs up to where it was, so the fall shows.
        await seedHistory(product.id, store.id, before ?? priceCents, place.currency);

        if (before) {
          await setPriceDrop(product.id, store.id, place.currency, priceCents, before);
        } else {
          await intelligence.priceDrop.deleteMany({
            where: { productId: product.id, storeId: store.id },
          });
        }
      }
    }
  }

  // Buenos Aires, around the Obelisco. Prices differ per chain so every
  // recommendation mode has a real answer: Coto is convenient but dearer,
  // Día is cheapest and furthest.
  const storeOrder = [
    await upsertStore(chains.coto.id, {
      name: 'Coto Centro',
      addressLine: 'Av. Corrientes 1200',
      latitude: kmSouth(0.6),
      longitude: HOME.longitude,
    }),
    await upsertStore(chains.carrefour.id, {
      name: 'Carrefour Almagro',
      addressLine: 'Av. Rivadavia 3900',
      latitude: kmSouth(2.5),
      longitude: HOME.longitude - 0.01,
    }),
    await upsertStore(chains.dia.id, {
      name: 'Día Caballito',
      addressLine: 'Av. La Plata 100',
      latitude: kmSouth(4),
      longitude: HOME.longitude - 0.02,
    }),
  ];

  const drops = [
    [0, 2, 150000], // milk at Día, −12%
    [5, 0, 106000], // water at Coto, −7%
    [3, 1, 250000], // oil at Carrefour, −6%
  ];

  await seedNeighbourhood(
    BUENOS_AIRES,
    storeOrder,
    [
      // product index, [Coto, Carrefour, Día]
      [0, [149000, 139000, 132000]],
      [1, [128000, 119000, 115000]],
      // Rice is cheapest at Coto, so the cheapest plan nearby splits the list
      // between Coto and Carrefour: a trip with two stops.
      [2, [165000, 179000, 168000]],
      [3, [242000, 235000, 219000]],
      [4, [162000, 158000, 149000]],
      [5, [98000, 94000, 89000]],
    ],
    drops,
  );

  // Vienna, around Stephansplatz, in euros. Billa is in the centre and
  // dearest, Hofer is the discounter a little further out.
  const viennaStores = [
    await upsertStore(
      chains.billa.id,
      { name: 'Billa Rotenturmstraße', addressLine: 'Rotenturmstraße 5', latitude: 48.2097, longitude: 16.3745 },
      WIEN,
    ),
    await upsertStore(
      chains.spar.id,
      { name: 'Spar Mariahilfer Straße', addressLine: 'Mariahilfer Straße 77', latitude: 48.1966, longitude: 16.3487 },
      WIEN,
    ),
    await upsertStore(
      chains.hofer.id,
      { name: 'Hofer Landstraße', addressLine: 'Landstraßer Hauptstraße 70', latitude: 48.2012, longitude: 16.392 },
      WIEN,
    ),
  ];

  const viennaDrops = [
    [5, 1, 79], // water at Spar, −12%
    [0, 2, 129], // milk at Hofer, −10%
    [2, 0, 239], // rice at Billa, −8%
  ];

  await seedNeighbourhood(
    WIEN,
    viennaStores,
    [
      // product index, [Billa, Spar, Hofer]
      [0, [139, 129, 115]],
      [1, [249, 229, 199]],
      [2, [219, 199, 179]],
      [3, [329, 299, 279]],
      [4, [289, 269, 239]],
      [5, [79, 69, 59]],
    ],
    viennaDrops,
  );

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

  // The same idea in euros, for planning a shop around Stephansplatz.
  const viennaList = await core.shoppingList.upsert({
    where: { id: '22222222-2222-4222-8222-222222222222' },
    create: {
      id: '22222222-2222-4222-8222-222222222222',
      ownerId: shopper.id,
      name: 'Compra en Viena',
      currency: 'EUR',
    },
    update: { ownerId: shopper.id, name: 'Compra en Viena', currency: 'EUR' },
  });

  await core.shoppingListItem.deleteMany({ where: { listId: viennaList.id } });
  await core.shoppingListItem.createMany({
    data: [
      { listId: viennaList.id, productId: products[0].id, quantity: 2, expectedUnitPriceCents: 115, position: 1000 },
      { listId: viennaList.id, productId: products[1].id, quantity: 1, expectedUnitPriceCents: 199, position: 2000 },
      { listId: viennaList.id, productId: products[3].id, quantity: 1, expectedUnitPriceCents: 279, position: 3000 },
      { listId: viennaList.id, productId: products[5].id, quantity: 3, expectedUnitPriceCents: 59, position: 4000 },
    ],
  });

  // Alerts the shopper has set, and what they have already been told.
  const alertIds = {
    milk: '33333333-3333-4333-8333-333333333301',
    water: '33333333-3333-4333-8333-333333333302',
    oil: '33333333-3333-4333-8333-333333333303',
  };
  const alerts = [
    // Milk below $ 1.400 within 5 km of the Obelisco.
    {
      id: alertIds.milk,
      productId: products[0].id,
      type: 'BELOW_THRESHOLD',
      storeId: null,
      thresholdCents: 140000,
      currency: 'ARS',
      ...HOME,
      radiusKm: 5,
    },
    // Water falling by 5% or more at Coto.
    { id: alertIds.water, productId: products[5].id, type: 'PRICE_DROP', storeId: storeOrder[0].id, dropPercent: 5, currency: 'ARS' },
    // Oil: whenever somewhere near the Obelisco becomes the cheapest.
    { id: alertIds.oil, productId: products[3].id, type: 'CHEAPER_NEARBY', storeId: null, currency: 'ARS', ...HOME, radiusKm: 5 },
  ];
  for (const alert of alerts) {
    await core.priceAlert.upsert({
      where: { id: alert.id },
      create: { ownerId: shopper.id, isEnabled: true, ...alert },
      update: { ownerId: shopper.id, isEnabled: true, ...alert },
    });
  }

  const hoursAgo = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000);
  const messages = [
    {
      key: 'milk-dia',
      productId: products[0].id,
      storeId: storeOrder[2].id,
      alertId: alertIds.milk,
      reason: 'BELOW_THRESHOLD',
      priceCents: 132000,
      previousPriceCents: 150000,
      currency: 'ARS',
      createdAt: hoursAgo(2),
      readAt: null,
    },
    {
      key: 'water-coto',
      productId: products[5].id,
      storeId: storeOrder[0].id,
      alertId: alertIds.water,
      reason: 'PRICE_DROP',
      priceCents: 98000,
      previousPriceCents: 106000,
      currency: 'ARS',
      createdAt: hoursAgo(5),
      readAt: null,
    },
    {
      key: 'oil-carrefour',
      productId: products[3].id,
      storeId: storeOrder[1].id,
      alertId: alertIds.oil,
      reason: 'CHEAPER_NEARBY',
      priceCents: 235000,
      previousPriceCents: 250000,
      currency: 'ARS',
      createdAt: hoursAgo(72),
      readAt: hoursAgo(70),
    },
    {
      key: 'milk-hofer',
      productId: products[0].id,
      storeId: viennaStores[2].id,
      alertId: null,
      reason: 'PRICE_DROP',
      priceCents: 115,
      previousPriceCents: 129,
      currency: 'EUR',
      createdAt: hoursAgo(26),
      readAt: null,
    },
  ];
  for (const { key, ...message } of messages) {
    // The server writes these two in English, for email and push; the app
    // composes its own from the facts beside them.
    const data = {
      userId: shopper.id,
      category: 'PRICE_ALERT',
      title: 'Price alert',
      body: 'A price you are watching changed.',
      status: 'SENT',
      sentAt: message.createdAt,
      deliverAt: message.createdAt,
      dedupeKey: `seed:${key}`,
      ...message,
    };
    await core.notification.upsert({ where: { dedupeKey: data.dedupeKey }, create: data, update: data });
  }

  // --- Shopper-added products and shops -------------------------------------

  // Team staples with no prices yet: enough products for a shop's ten.
  const staples = [];
  for (const [name, packageSize, unit] of [
    ['Fideos Spaghetti 500g', 500, 'GRAM'],
    ['Azúcar 1kg', 1, 'KILOGRAM'],
    ['Harina 0000 1kg', 1, 'KILOGRAM'],
    ['Yerba Mate 500g', 500, 'GRAM'],
    ['Sal Fina 500g', 500, 'GRAM'],
  ]) {
    staples.push(
      await upsertProduct({
        name,
        normalizedName: name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
        categoryId: almacen.id,
        packageSize,
        unit,
      }),
    );
  }
  const everything = [...products, ...staples];

  // A product a neighbour added: visible to everyone, unverified, for the
  // shopper to confirm or report.
  await upsertProduct({
    name: 'Alfajor Artesanal de Maicena',
    normalizedName: 'alfajor artesanal de maicena',
    categoryId: almacen.id,
    packageSize: 1,
    unit: 'UNIT',
    origin: 'COMMUNITY',
    createdById: neighbour.id,
    weight: 0,
    confirmationCount: 0,
    flagCount: 0,
    moderationStatus: 'ACTIVE',
  });
  const alfajor = await core.product.findFirstOrThrow({ where: { normalizedName: 'alfajor artesanal de maicena' } });
  await core.productConfirmation.deleteMany({ where: { productId: alfajor.id } });
  await core.contentFlag.deleteMany({ where: { targetType: 'PRODUCT', targetId: alfajor.id } });

  // Shops the shopper added, not public yet: one near the Obelisco at 6 of 10
  // products priced, one by Stephansplatz at 9, which one more price publishes.
  // Each a little further out than the team's nearest, which stays the default.
  async function privateShop(chainName, store, place, priced) {
    const slug = chainName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const chain = await core.supermarket.upsert({
      where: { slug },
      create: { name: chainName, slug, origin: 'COMMUNITY', createdById: shopper.id },
      update: {},
    });
    const row = await upsertStore(chain.id, store, place);
    await core.storePriceContributor.deleteMany({ where: { storeLocationId: row.id } });
    await core.storePriceContributor.createMany({
      data: everything.slice(0, priced).map((product) => ({
        storeLocationId: row.id,
        productId: product.id,
        userId: shopper.id,
      })),
    });
    return core.storeLocation.update({
      where: { id: row.id },
      data: {
        origin: 'COMMUNITY',
        createdById: shopper.id,
        moderationStatus: 'ACTIVE',
        publishedAt: null,
        pricedProductCount: priced,
        contributorCount: 1,
        flagCount: 0,
      },
    });
  }
  const donPepe = await privateShop(
    'Almacén Don Pepe',
    { name: 'Almacén Don Pepe', addressLine: 'Tucumán 1200', latitude: kmSouth(1.2), longitude: HOME.longitude + 0.004 },
    BUENOS_AIRES,
    6,
  );
  const nahFrisch = await privateShop(
    'Nah&Frisch',
    { name: 'Nah&Frisch Singerstraße', addressLine: 'Singerstraße 8', latitude: 48.205, longitude: 16.38 },
    WIEN,
    9,
  );

  console.log(`
Seeded:
  users        admin@garner.test (ADMIN), moderator@garner.test (MODERATOR),
               shopper@garner.test (USER, 90 days old), vecina@garner.test (USER)
  password     ${PASSWORD}
  catalog      ${products.length} products, 4 categories, 2 brands, ${barcodes.length} barcodes
  stores       ${storeOrder.length} around the Obelisco (Coto, Carrefour, Día, in ARS)
               ${viennaStores.length} around Stephansplatz, Vienna (Billa, Spar, Hofer, in EUR)
  prices       current price + 14 days of history per product/store
  price drops  ${drops.length} near the Obelisco, ${viennaDrops.length} near Stephansplatz
  alerts       3 price alerts and 4 messages (3 unread), the shopper's
  lists        "Compra semanal" (4 items, ARS) and "Compra en Viena" (4 items, EUR), the shopper's
  community    "Alfajor Artesanal de Maicena", added by vecina, unverified;
               the shopper's private shops "${donPepe.name}" (6 of 10 priced) and
               "${nahFrisch.name}" (9 of 10: one more price publishes it);
               ${staples.length} team staples without prices
  home point   ${HOME.latitude}, ${HOME.longitude} (the shopper's saved location, "Centro")
  vienna point ${VIENNA.latitude}, ${VIENNA.longitude} (Stephansplatz)
`);
}

try {
  await main();
} finally {
  await Promise.all([core.$disconnect(), intelligence.$disconnect()]);
}
