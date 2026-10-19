/**
 * A city-sized world for load tests, written straight into the load
 * databases with set-based SQL so it takes seconds rather than hours.
 *
 * Sized by environment, defaulting to a one-city launch:
 *   LOAD_PRODUCTS (3000)  LOAD_CHAINS (3)  LOAD_STORES_PER_CHAIN (20)
 *   LOAD_COVERAGE (50)    % of product/store pairs a chain prices
 *   LOAD_HISTORY_DAYS (30) LOAD_USERS (300)
 *
 * Every priced pair has a derived price, a daily history, and one feed
 * observation confirmed through today — the steady state that delta
 * detection produces. Prices are deterministic per pair (hash-based), so the
 * three databases agree without passing rows between them.
 */
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import pg from 'pg';

const env = (name, fallback) => Number(process.env[name] ?? fallback);
const PRODUCTS = env('LOAD_PRODUCTS', 3000);
const CHAINS = env('LOAD_CHAINS', 3);
const STORES_PER_CHAIN = env('LOAD_STORES_PER_CHAIN', 20);
const COVERAGE = env('LOAD_COVERAGE', 50);
const HISTORY_DAYS = env('LOAD_HISTORY_DAYS', 30);
const USERS = env('LOAD_USERS', 300);
const PASSWORD = 'correct-horse-battery';

const connect = async (url) => {
  const client = new pg.Client({ connectionString: url.replace('?schema=public', '') });
  await client.connect();
  return client;
};

const core = await connect(process.env.CORE_DB_URL);
const pricing = await connect(process.env.PRICING_DB_URL);
const intelligence = await connect(process.env.INTELLIGENCE_DB_URL);

const started = Date.now();
const step = (label) =>
  console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s] ${label}`);

// --- core: catalog, stores, people, lists ---------------------------------

const WORDS = [
  'Leche', 'Yogur', 'Queso', 'Manteca', 'Pan', 'Galletitas', 'Arroz', 'Fideos',
  'Harina', 'Azúcar', 'Aceite', 'Vinagre', 'Café', 'Té', 'Yerba', 'Agua',
  'Gaseosa', 'Jugo', 'Cerveza', 'Vino', 'Detergente', 'Jabón', 'Shampoo',
  'Papel', 'Atún', 'Arvejas', 'Tomate', 'Mermelada', 'Dulce', 'Cacao',
];
const BRANDS = Array.from({ length: 60 }, (_, i) => `Marca ${String.fromCharCode(65 + (i % 26))}${i}`);

await core.query(`INSERT INTO categories (id, name, slug, "updatedAt")
  SELECT gen_random_uuid(), w, lower(w) || '-' || i, now()
  FROM unnest($1::text[]) WITH ORDINALITY AS t(w, i)`, [WORDS]);
await core.query(`INSERT INTO products_brands (id, name, slug, "normalizedName", "updatedAt")
  SELECT gen_random_uuid(), b, 'brand-' || i, lower(b), now()
  FROM unnest($1::text[]) WITH ORDINALITY AS t(b, i)`, [BRANDS]);

await core.query(`
  INSERT INTO products (id, name, "normalizedName", "brandId", "categoryId", "packageSize", unit, "updatedAt")
  SELECT gen_random_uuid(), p.label, lower(translate(p.label, 'áéíóú', 'aeiou')), brand.id, category.id, p.size, 'UNIT', now()
  FROM (
    SELECT n,
      ($2::text[])[1 + n % cardinality($2::text[])] AS word,
      ($3::text[])[1 + (n * 7) % cardinality($3::text[])] AS brand_name,
      100 + n % 900 AS size,
      ($2::text[])[1 + n % cardinality($2::text[])] || ' ' ||
        ($3::text[])[1 + (n * 7) % cardinality($3::text[])] || ' ' || (100 + n % 900) || 'g #' || n AS label
    FROM generate_series(1, $1) n
  ) p
  JOIN categories category ON category.name = p.word
  JOIN products_brands brand ON brand.name = p.brand_name`,
  [PRODUCTS, WORDS, BRANDS]);
await core.query(`INSERT INTO product_barcodes (id, code, "productId", "isPrimary")
  SELECT gen_random_uuid(), '779' || lpad((row_number() OVER ())::text, 10, '0'), id, true FROM products`);
step(`${PRODUCTS} products`);

await core.query(`INSERT INTO supermarkets (id, name, slug, "updatedAt")
  SELECT gen_random_uuid(), 'Cadena ' || c, 'cadena-' || c, now() FROM generate_series(1, $1) c`, [CHAINS]);
// Stores spread over ~15 km around central Buenos Aires.
await core.query(`
  INSERT INTO store_locations (id, "supermarketId", name, "addressLine", city, country, latitude, longitude, "updatedAt")
  SELECT gen_random_uuid(), s.id, s.name || ' ' || n, 'Calle ' || n, 'Buenos Aires', 'AR',
    -34.6037 + (((hashtext(s.name || n) % 1000) / 1000.0) * 0.13),
    -58.3816 + (((hashtext(n || s.name) % 1000) / 1000.0) * 0.16),
    now()
  FROM supermarkets s, generate_series(1, $1) n`, [STORES_PER_CHAIN]);
await core.query(`INSERT INTO store_opening_hours (id, "storeLocationId", "dayOfWeek", "opensAt", "closesAt")
  SELECT gen_random_uuid(), s.id, d, '08:00', '22:00' FROM store_locations s, generate_series(0, 6) d`);
step(`${CHAINS * STORES_PER_CHAIN} stores`);

const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
await core.query(`INSERT INTO users (id, email, "passwordHash", "displayName", role, "createdAt", "updatedAt")
  SELECT gen_random_uuid(), 'load-' || n || '@garner.test', $2, 'Shopper ' || n, 'USER', now() - interval '60 days', now()
  FROM generate_series(1, $1) n`, [USERS, passwordHash]);
await core.query(`INSERT INTO users (id, email, "passwordHash", "displayName", role, "updatedAt")
  VALUES (gen_random_uuid(), 'load-admin@garner.test', $1, 'Load Admin', 'ADMIN', now())`, [passwordHash]);
await core.query(`INSERT INTO user_preferences ("userId", latitude, longitude, "updatedAt")
  SELECT id, -34.6037, -58.3816, now() FROM users`);
await core.query(`INSERT INTO shopping_lists (id, "ownerId", name, currency, "updatedAt")
  SELECT gen_random_uuid(), id, 'Compra semanal', 'ARS', now() FROM users WHERE role = 'USER'`);
// Twelve products per list, drawn from the most commonly priced ones.
await core.query(`
  INSERT INTO shopping_list_items (id, "listId", "productId", quantity, position, "updatedAt")
  SELECT gen_random_uuid(), l.id, p.id, 1 + (i % 3), i, now()
  FROM shopping_lists l
  CROSS JOIN generate_series(0, 11) i
  JOIN LATERAL (
    SELECT id FROM products ORDER BY id OFFSET (abs(hashtext(l.id::text || i)) % least($1, 400)) LIMIT 1
  ) p ON true`, [PRODUCTS]);
step(`${USERS} shoppers with lists`);

const products = (await core.query('SELECT id FROM products')).rows.map((r) => r.id);
const stores = (await core.query('SELECT id, "supermarketId" FROM store_locations')).rows;
const storeIds = stores.map((s) => s.id);

// --- deterministic pairs and prices, identical in every database ----------

const PAIRS = `
  SELECT p AS product_id, s AS store_id,
    (500 + abs(hashtext(p::text)) % 20000) * (90 + abs(hashtext(s::text)) % 21) / 100 AS price
  FROM unnest($1::uuid[]) p CROSS JOIN unnest($2::uuid[]) s
  WHERE abs(hashtext(p::text || s::text)) % 100 < $3`;

await intelligence.query(`
  INSERT INTO derived_prices ("productId", "storeId", currency, "priceCents", "minPriceCents", "maxPriceCents",
    confidence, "confidenceLevel", "observationCount", "lastObservedAt")
  SELECT product_id, store_id, 'ARS', price, price, price, 0.9, 'VERY_RECENT', 1, now() - interval '2 hours'
  FROM (${PAIRS}) pairs`, [products, storeIds, COVERAGE]);
const pairCount = (await intelligence.query('SELECT count(*)::int AS n FROM derived_prices')).rows[0].n;
step(`${pairCount} derived prices`);

await intelligence.query(`
  INSERT INTO daily_price_history ("productId", "storeId", date, currency, "weightedAverageCents",
    "minPriceCents", "maxPriceCents", "observationCount", confidence)
  SELECT product_id, store_id, current_date - d, 'ARS',
    price + (abs(hashtext(product_id::text || d)) % 7) - 3, price - 3, price + 3, 1, 0.9
  FROM (${PAIRS}) pairs CROSS JOIN generate_series(1, $4) d`,
  [products, storeIds, COVERAGE, HISTORY_DAYS]);
step(`${pairCount * HISTORY_DAYS} daily history rows`);

// --- pricing: one feed source per chain, its links, and its observations ---

const sandboxDir = process.env.EXTERNAL_SOURCE_SANDBOX_DIR;
await mkdir(sandboxDir, { recursive: true });
const sourceIds = [];

for (const [index, supermarketId] of [...new Set(stores.map((s) => s.supermarketId))].entries()) {
  const sourceId = randomUUID();
  sourceIds.push(sourceId);

  // Disabled, so the scheduler never starts an import in the middle of a
  // measurement; bench-jobs.mjs runs them on purpose.
  await pricing.query(`INSERT INTO external_price_sources (id, name, slug, "supermarketId", "adapterKey", config, "isEnabled", "updatedAt")
    VALUES ($1, $2, $3, $4, 'sandbox-file', $5, false, now())`, [
    sourceId, `Feed ${index + 1}`, `feed-${index + 1}`, supermarketId,
    JSON.stringify({ productsFile: `feed-${index + 1}-products.json`, pricesFile: `feed-${index + 1}-prices.json` }),
  ]);
  const chainStores = stores.filter((s) => s.supermarketId === supermarketId).map((s) => s.id);

  await pricing.query(`INSERT INTO external_store_links (id, "sourceId", "externalStoreId", "storeId")
    SELECT gen_random_uuid(), $1, s::text, s FROM unnest($2::uuid[]) s`, [sourceId, chainStores]);
  await pricing.query(`INSERT INTO external_product_links (id, "sourceId", "externalProductId", "productId", "externalName", "matchMethod", status, "updatedAt")
    SELECT gen_random_uuid(), $1, p::text, p, 'Producto ' || p, 'EXTERNAL_ID', 'MATCHED', now() FROM unnest($2::uuid[]) p`,
    [sourceId, products]);

  // One feed observation per priced pair, first seen 20 days ago and
  // confirmed by every import since.
  await pricing.query(`
    INSERT INTO price_observations (id, "productId", "storeId", "priceCents", currency, "observedAt", "receivedAt",
      "sourceType", status, "dedupeKey", "lastConfirmedAt")
    SELECT gen_random_uuid(), product_id, store_id, price, 'ARS', now() - interval '20 days', now() - interval '20 days',
      'EXTERNAL_API', 'ACCEPTED', 'external:' || $4 || ':seed:' || product_id || ':' || store_id, now() - interval '1 day'
    FROM (${PAIRS}) pairs`, [products, chainStores, COVERAGE, sourceId]);

  // Today's feed: the same prices, except one pair in ten moved.
  const feed = (await pricing.query(`
    SELECT product_id, store_id, price FROM (${PAIRS}) pairs`, [products, chainStores, COVERAGE])).rows;
  await writeFile(`${sandboxDir}/feed-${index + 1}-products.json`,
    JSON.stringify(products.map((id) => ({ externalId: id, name: `Producto ${id}` }))));
  await writeFile(`${sandboxDir}/feed-${index + 1}-prices.json`, JSON.stringify(feed.map((row, i) => ({
    externalProductId: row.product_id,
    externalStoreId: row.store_id,
    priceCents: i % 10 === 0 ? Math.round(row.price * 1.05) : row.price,
    currency: 'ARS',
  }))));
}

// Shoppers' own reports over the last month.
await pricing.query(`
  INSERT INTO price_observations (id, "productId", "storeId", "priceCents", currency, "observedAt", "receivedAt",
    "sourceType", status, "userId")
  SELECT gen_random_uuid(), product_id, store_id, price, 'ARS', ts, ts, 'USER_REPORTED', 'ACCEPTED', gen_random_uuid()
  FROM (${PAIRS}) pairs, LATERAL (SELECT now() - (abs(hashtext(product_id::text)) % 30) * interval '1 day' AS ts) t
  WHERE abs(hashtext(store_id::text || product_id::text)) % 10 = 0`, [products, storeIds, COVERAGE]);
const observations = (await pricing.query('SELECT count(*)::int AS n FROM price_observations')).rows[0].n;
step(`${observations} raw observations, ${sourceIds.length} feeds with fixtures`);

for (const client of [core, pricing, intelligence]) {
  await client.query('ANALYZE');
  await client.end();
}
step('done');
