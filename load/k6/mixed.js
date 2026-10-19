/**
 * A mixed workload against a seeded load environment (see docs/performance.md):
 * shoppers browsing and comparing prices, reporting prices, and asking where
 * to buy their list — all at once, at fixed arrival rates, so latency is
 * measured at a known load rather than at whatever rate the server sustains.
 *
 *   pnpm run load:http                     (defaults below)
 *   RATE_SCALE=2 pnpm run load:http        (twice the traffic)
 *   ONLY=browse pnpm run load:http         (one scenario, to isolate it)
 */
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:3100';
const SCALE = Number(__ENV.RATE_SCALE || 1);
const DURATION = __ENV.DURATION || '2m';
// Enough accounts that reports stay under the per-account limit (60 an hour)
// across repeated runs; fewer, and the system's own protection answers 429.
const SHOPPERS = 200;
const HOME = { lat: -34.6037, lon: -58.3816 };

const optimizationTime = new Trend('optimization_end_to_end', true);

const rate = (perSecond) => Math.max(1, Math.round(perSecond * SCALE));

const ALL_SCENARIOS = {
    browse: {
      executor: 'constant-arrival-rate',
      exec: 'browse',
      rate: rate(30),
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 50,
      maxVUs: 300,
    },
    contribute: {
      executor: 'constant-arrival-rate',
      exec: 'contribute',
      rate: rate(4),
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 10,
      maxVUs: 50,
    },
    optimize: {
      executor: 'constant-arrival-rate',
      exec: 'optimize',
      rate: rate(1),
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 10,
      maxVUs: 60,
    },
};

const only = (__ENV.ONLY || '').split(',').filter(Boolean);

export const options = {
  scenarios: only.length
    ? Object.fromEntries(only.map((name) => [name, ALL_SCENARIOS[name]]))
    : ALL_SCENARIOS,
  // A regression gate: about 1.5× the recorded baseline in
  // docs/performance.md, so a change that slows a hot path fails the run.
  // They describe the reference laptop, not a service level objective.
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:search}': ['p(50)<20', 'p(95)<700'],
    'http_req_duration{endpoint:compare}': ['p(50)<20', 'p(95)<700'],
    'http_req_duration{endpoint:history}': ['p(50)<30', 'p(95)<400'],
    'http_req_duration{endpoint:submit}': ['p(50)<50', 'p(95)<1000'],
    'http_req_duration{endpoint:optimize}': ['p(50)<50', 'p(95)<1000'],
    optimization_end_to_end: ['p(95)<2500'],
  },
};

const json = (token) => ({
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
});

const pick = (items) => items[Math.floor(Math.random() * items.length)];

export function setup() {
  const login = (email) => {
    const response = http.post(
      `${BASE}/v1/auth/login`,
      JSON.stringify({ email, password: 'correct-horse-battery' }),
      { headers: { 'content-type': 'application/json' } },
    );
    if (response.status !== 200) fail(`login ${email}: ${response.status}`);
    return response.json('accessToken');
  };

  const shoppers = [];
  for (let n = 1; n <= SHOPPERS; n++) {
    const token = login(`load-${n}@garner.test`);
    const lists = http.get(`${BASE}/v1/shopping-lists`, json(token)).json('data');
    shoppers.push({ token, listId: lists[0].id });
  }

  const products = [];
  for (let page = 1; page <= 10; page++) {
    const body = http.get(`${BASE}/v1/products?pageSize=100&page=${page}`, json(shoppers[0].token)).json();
    products.push(...body.data.map((product) => product.id));
  }

  const stores = http
    .get(`${BASE}/v1/stores?pageSize=100`, json(shoppers[0].token))
    .json('data')
    .map((store) => store.id);

  return { shoppers, products, stores };
}

const SEARCH_TERMS = ['leche', 'yerba', 'cafe', 'marca b', 'fideos 250', 'aceite', 'jabon', 'agua', 'te', 'pan'];

export function browse(data) {
  const { token } = pick(data.shoppers);
  const productId = pick(data.products);

  const search = http.get(
    `${BASE}/v1/products?search=${encodeURIComponent(pick(SEARCH_TERMS))}&pageSize=20`,
    { ...json(token), tags: { endpoint: 'search' } },
  );
  check(search, { 'search 200': (r) => r.status === 200 });

  const compare = http.get(
    `${BASE}/v1/products/${productId}/prices?latitude=${HOME.lat}&longitude=${HOME.lon}`,
    { ...json(token), tags: { endpoint: 'compare' } },
  );
  check(compare, { 'compare 200': (r) => r.status === 200 });

  const history = http.get(`${BASE}/v1/products/${productId}/prices/history?range=30d`, {
    ...json(token),
    tags: { endpoint: 'history' },
  });
  check(history, { 'history 200': (r) => r.status === 200 });
}

export function contribute(data) {
  const { token } = pick(data.shoppers);
  // Behind a proxy every shopper has their own address; without this, one
  // load generator would be one IP and hit the per-IP limit in a minute.
  const ip = `10.${__VU % 250}.${__ITER % 250}.${Math.floor(Math.random() * 250)}`;

  const response = http.post(
    `${BASE}/v1/price-observations`,
    JSON.stringify({
      productId: pick(data.products),
      storeId: pick(data.stores),
      priceCents: 500 + Math.floor(Math.random() * 5000),
      currency: 'ARS',
    }),
    { headers: { ...json(token).headers, 'x-forwarded-for': ip }, tags: { endpoint: 'submit' } },
  );
  check(response, { 'submit 201': (r) => r.status === 201 });
}

export function optimize(data) {
  const { token, listId } = pick(data.shoppers);
  const startedAt = Date.now();

  // A slightly different spot each time, so the answer is computed rather
  // than reused from the last 15 minutes.
  const response = http.post(
    `${BASE}/v1/shopping-lists/${listId}/optimize`,
    JSON.stringify({
      latitude: HOME.lat + (Math.random() - 0.5) * 0.02,
      longitude: HOME.lon + (Math.random() - 0.5) * 0.02,
    }),
    { ...json(token), tags: { endpoint: 'optimize' } },
  );
  if (!check(response, { 'optimize accepted': (r) => r.status === 202 || r.status === 200 })) {
    return;
  }

  const id = response.json('id');
  for (let poll = 0; poll < 60; poll++) {
    const status = response.status === 200
      ? response.json('status')
      : http.get(`${BASE}/v1/optimizations/${id}`, { ...json(token), tags: { endpoint: 'optimization-poll' } }).json('status');

    if (status === 'COMPLETED' || status === 'FAILED') {
      check(status, { 'optimization completed': (s) => s === 'COMPLETED' });
      optimizationTime.add(Date.now() - startedAt);
      return;
    }
    sleep(0.25);
  }

  check(null, { 'optimization completed': () => false });
}
